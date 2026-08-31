import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserData, UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const SALT_ROUNDS = 12;

/** Mensaje de conflicto por campo único del registro: mismo texto en la pre-consulta y en P2002. */
const UNIQUE_FIELD_MESSAGES = {
  email: 'Ya existe una cuenta con ese correo electrónico',
  username: 'Ese username ya está en uso',
  cedula: 'Ya existe una cuenta con esa cédula',
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto & { refreshToken: string }> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException(UNIQUE_FIELD_MESSAGES.email);
    }
    const existingUsername = await this.usersService.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException(UNIQUE_FIELD_MESSAGES.username);
    }
    const existingCedula = await this.usersService.findByCedula(dto.cedula);
    if (existingCedula) {
      throw new ConflictException(UNIQUE_FIELD_MESSAGES.cedula);
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.createUserOrConflict({
      email: dto.email,
      passwordHash,
      name: dto.name,
      username: dto.username,
      cedula: dto.cedula,
    });

    return this.buildAuthResponse(user);
  }

  /**
   * Las tres consultas de `register` son una comodidad para dar el mensaje exacto,
   * pero entre consultar y insertar cabe otro registro: el índice único de la base
   * es la garantía real, así que su violación (P2002) devuelve el mismo 409 y no un 500.
   */
  private async createUserOrConflict(data: CreateUserData) {
    try {
      return await this.usersService.create(data);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // `meta.target` es el nombre del índice en Postgres (p. ej. `users_username_key`).
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : String(error.meta?.target ?? '');
        const field = (
          Object.keys(UNIQUE_FIELD_MESSAGES) as Array<keyof typeof UNIQUE_FIELD_MESSAGES>
        ).find((key) => target.includes(key));
        throw new ConflictException(
          field ? UNIQUE_FIELD_MESSAGES[field] : 'Ya existe una cuenta con esos datos',
        );
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto & { refreshToken: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.buildAuthResponse(user);
  }

  async refresh(user: AuthenticatedUser): Promise<AuthResponseDto & { refreshToken: string }> {
    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser) {
      throw new UnauthorizedException();
    }
    return this.buildAuthResponse(fullUser);
  }

  getRefreshCookieOptions() {
    const isProduction = this.configService.get('nodeEnv') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/api/auth',
      maxAge: this.parseExpiresInMs(this.configService.get<string>('jwt.refreshExpiresIn')!),
    };
  }

  private parseExpiresInMs(expiresIn: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    return value * unitMs;
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    name: string | null;
    role: Role;
  }): Promise<AuthResponseDto & { refreshToken: string }> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
