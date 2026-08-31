import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const configValues: Record<string, unknown> = {
    'jwt.accessSecret': 'access-secret',
    'jwt.accessExpiresIn': '15m',
    'jwt.refreshSecret': 'refresh-secret',
    'jwt.refreshExpiresIn': '7d',
    nodeEnv: 'test',
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findByCedula: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    } as unknown as jest.Mocked<JwtService>;

    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    authService = new AuthService(usersService, jwtService, configService);
  });

  const validRegisterDto = {
    email: 'new@example.com',
    password: 'password123',
    name: 'Ada Lovelace',
    username: 'ada.lovelace',
    cedula: '1020304050',
  };

  describe('register', () => {
    it('throws ConflictException when the email is already taken', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'taken@example.com',
        passwordHash: 'hash',
        name: null,
        role: 'USER',
      } as any);

      await expect(
        authService.register({ ...validRegisterDto, email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when the username is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findByUsername.mockResolvedValue({ id: '1' } as any);

      await expect(authService.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws ConflictException when the cedula is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findByUsername.mockResolvedValue(null);
      usersService.findByCedula.mockResolvedValue({ id: '1' } as any);

      await expect(authService.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('creates the user with a hashed password and returns tokens', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findByUsername.mockResolvedValue(null);
      usersService.findByCedula.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: '1',
        email: 'new@example.com',
        passwordHash: 'hashed',
        name: 'Ada Lovelace',
        role: 'USER',
      } as any);

      const result = await authService.register(validRegisterDto);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', username: 'ada.lovelace' }),
      );
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.user.email).toBe('new@example.com');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'missing@example.com', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        passwordHash,
        name: null,
        role: 'USER',
      } as any);

      await expect(
        authService.login({ email: 'user@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns tokens when the credentials are valid', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      usersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        passwordHash,
        name: null,
        role: 'USER',
      } as any);

      const result = await authService.login({
        email: 'user@example.com',
        password: 'correct-password',
      });

      expect(result.accessToken).toBe('signed-token');
    });
  });
});
