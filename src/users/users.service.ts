import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { BYTES_PER_MB } from '../files/utils/file-type.util';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { UpdateMeDto } from './dto/update-me.dto';

const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  username: string;
  cedula: string;
}

export interface UserPublicView {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  isPublic: boolean;
  followersCount: number;
  followingCount: number;
  viewerFollows: boolean;
  followsViewer: boolean;
  bio?: string | null;
}

export interface MeView extends UserPublicView {
  email: string;
  role: Role;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findByCedula(cedula: string) {
    return this.prisma.user.findUnique({ where: { cedula } });
  }

  create(data: CreateUserData) {
    return this.prisma.user.create({ data });
  }

  updateRole(id: string, role: Role) {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async getMe(userId: string): Promise<MeView> {
    const user = await this.requireById(userId);
    const publicView = await this.toUserPublic(user, { includeExtended: true });
    return { ...publicView, email: user.email, role: user.role };
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeView> {
    await this.requireById(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, bio: dto.bio, isPublic: dto.isPublic },
    });
    const publicView = await this.toUserPublic(updated, { includeExtended: true });
    return { ...publicView, email: updated.email, role: updated.role };
  }

  async updateAvatar(userId: string, file: Express.Multer.File | undefined): Promise<MeView> {
    if (!file) {
      throw new BadRequestException('No se recibió ninguna imagen');
    }
    if (!AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('El avatar debe ser una imagen JPEG, PNG o WEBP');
    }
    const maxAvatarMb = this.configService.get<number>('uploads.maxAvatarMb')!;
    if (file.size > maxAvatarMb * BYTES_PER_MB) {
      throw new PayloadTooLargeException(`El avatar supera el tamaño máximo de ${maxAvatarMb} MB`);
    }

    const user = await this.requireById(userId);
    const key = `avatars/${userId}/${randomUUID()}${extname(file.originalname)}`;
    await this.storageService.upload({ key, body: file.buffer, contentType: file.mimetype });

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key },
    });
    // El avatar nuevo ya está guardado y referenciado: borrar el anterior es limpieza,
    // no parte del cambio. Si S3 falla aquí, se registra y se deja la key huérfana en
    // vez de responder 500 sobre una actualización que sí se aplicó.
    if (user.avatarKey) {
      try {
        await this.storageService.delete(user.avatarKey);
      } catch (error) {
        this.logger.warn(
          `No se pudo borrar el avatar anterior (${user.avatarKey}): ${String(error)}`,
        );
      }
    }

    const publicView = await this.toUserPublic(updated, { includeExtended: true });
    return { ...publicView, email: updated.email, role: updated.role };
  }

  /**
   * `viewerId` es opcional: la ruta es `@OptionalAuth()` porque los perfiles se comparten por
   * link. Un visitante sin sesión nunca es el dueño, así que solo ve perfiles públicos.
   */
  async getPublicProfile(username: string, viewerId?: string): Promise<UserPublicView> {
    const user = await this.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    // La regla completa de visibilidad (follow mutuo) llega en la Fase 3 con el
    // módulo `social`; por ahora solo existe el propio perfil y el flag `isPublic`.
    const hasAccess = (viewerId !== undefined && user.id === viewerId) || user.isPublic;
    return this.toUserPublic(user, { includeExtended: hasAccess });
  }

  private async requireById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  private async toUserPublic(
    user: User,
    opts: { includeExtended: boolean },
  ): Promise<UserPublicView> {
    const avatarUrl = user.avatarKey
      ? await this.storageService.getSignedDownloadUrl(user.avatarKey)
      : null;

    const base: UserPublicView = {
      id: user.id,
      username: user.username,
      name: user.name ?? '',
      avatarUrl,
      isPublic: user.isPublic,
      // Followers/following y follows mutuos dependen del módulo `social` (Fase 3),
      // que todavía no existe: hasta entonces el conteo real es cero para todos.
      followersCount: 0,
      followingCount: 0,
      viewerFollows: false,
      followsViewer: false,
    };

    if (!opts.includeExtended) {
      return base;
    }
    return { ...base, bio: user.bio ?? null };
  }
}
