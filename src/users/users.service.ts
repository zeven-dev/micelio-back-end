import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeedLayout, Role, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BYTES_PER_MB } from '../files/utils/file-type.util';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';
import { PresignAvatarDto } from './dto/presign-avatar.dto';
import { PresignAvatarResponseDto } from './dto/presign-avatar-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';

const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  username: string;
  cedula: string;
}

export interface FeedSettingsView {
  layout: FeedLayout;
  columns: number;
  gap: number;
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
  feedSettings?: FeedSettingsView;
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
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
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
      data: {
        name: dto.name,
        bio: dto.bio,
        isPublic: dto.isPublic,
        // `feedSettings` es parcial dentro de parcial: las claves ausentes quedan como estaban
        // (`undefined` no escribe en Prisma).
        feedLayout: dto.feedSettings?.layout,
        feedColumns: dto.feedSettings?.columns,
        feedGap: dto.feedSettings?.gap,
      },
    });
    const publicView = await this.toUserPublic(updated, { includeExtended: true });
    return { ...publicView, email: updated.email, role: updated.role };
  }

  async presignAvatar(userId: string, dto: PresignAvatarDto): Promise<PresignAvatarResponseDto> {
    if (!AVATAR_MIME_TYPES.includes(dto.mimeType)) {
      throw new UnsupportedMediaTypeException('El avatar debe ser una imagen JPEG, PNG o WEBP');
    }
    // El avatar tiene su propio tope (`UPLOAD_MAX_AVATAR_MB`), más chico que el de una imagen
    // de biblioteca: se muestra siempre y en miniatura, no tiene sentido guardarlo pesado.
    const maxAvatarBytes = this.configService.get<number>('uploads.maxAvatarMb')! * BYTES_PER_MB;
    if (dto.size > maxAvatarBytes) {
      throw new PayloadTooLargeException(
        `El avatar supera el tamaño máximo de ${Math.floor(maxAvatarBytes / BYTES_PER_MB)} MB`,
      );
    }

    const extension =
      dto.mimeType === 'image/png' ? '.png' : dto.mimeType === 'image/webp' ? '.webp' : '.jpg';
    const key = `avatars/${userId}/${randomUUID()}${extension}`;
    const expiresIn = this.configService.get<number>('s3.signedUrlExpiresIn') ?? 300;
    const uploadUrl = await this.storageService.getSignedUploadUrl(key, dto.mimeType, expiresIn);

    return { key, uploadUrl, expiresIn };
  }

  async updateAvatar(userId: string, dto: ConfirmAvatarDto): Promise<MeView> {
    const expectedPrefix = `avatars/${userId}/`;
    if (!dto.key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('La key subida no corresponde a este usuario');
    }

    const uploaded = await this.storageService.headObject(dto.key);
    if (!uploaded) {
      throw new NotFoundException(
        'El avatar todavía no llegó a S3; sube el binario antes de confirmar',
      );
    }

    // La URL prefirmada no impone tamaño: el `size` del presign era una promesa del cliente.
    // El tamaño real solo lo sabe S3, y un avatar pasado de peso se borra en vez de quedar
    // huérfano en el bucket.
    const maxAvatarBytes = this.configService.get<number>('uploads.maxAvatarMb')! * BYTES_PER_MB;
    if (uploaded.size > maxAvatarBytes) {
      await this.storageService.delete(dto.key);
      throw new PayloadTooLargeException(
        `El avatar supera el tamaño máximo de ${Math.floor(maxAvatarBytes / BYTES_PER_MB)} MB`,
      );
    }

    const user = await this.requireById(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: dto.key },
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

  /**
   * ¿Puede `viewerId` ver el contenido de `ownerId`? Fase 2: el dueño siempre; cualquiera si el
   * perfil es público. El **follow mutuo** llega en la Fase 3 con el módulo `social`, que se
   * lleva esta regla a su helper único — hasta entonces vive aquí, en un solo lugar, para que
   * `posts` no la reimplemente.
   */
  async canViewContentOf(ownerId: string, viewerId?: string): Promise<boolean> {
    if (viewerId !== undefined && viewerId === ownerId) {
      return true;
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { isPublic: true },
    });
    return owner?.isPublic ?? false;
  }

  /**
   * `UserPublic` de varios usuarios de una sola vez, indexado por id. Lo usan los módulos que
   * embeben autores en sus respuestas (`posts`) sin consultar la tabla `users` por su cuenta.
   */
  async getPublicViewsByIds(
    ids: string[],
    viewerId?: string,
  ): Promise<Map<string, UserPublicView>> {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } } });
    const views = await Promise.all(
      users.map(async (user) => {
        const hasAccess = (viewerId !== undefined && user.id === viewerId) || user.isPublic;
        return [user.id, await this.toUserPublic(user, { includeExtended: hasAccess })] as const;
      }),
    );
    return new Map(views);
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
    return {
      ...base,
      bio: user.bio ?? null,
      // Cómo curó el dueño su feed: los visitantes con acceso lo ven exactamente igual que él.
      feedSettings: {
        layout: user.feedLayout,
        columns: user.feedColumns,
        gap: user.feedGap,
      },
    };
  }
}
