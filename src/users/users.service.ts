import {
  forwardRef,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedLayout, PostKind, Role, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BYTES_PER_MB } from '../files/utils/file-type.util';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocialGraphInfo, SocialService } from '../social/social.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { ConfirmAvatarDto } from './dto/confirm-avatar.dto';
import { PresignAvatarDto } from './dto/presign-avatar.dto';
import { PresignAvatarResponseDto } from './dto/presign-avatar-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';

const PROFILE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Las dos imágenes de perfil (avatar y portada) comparten camino de subida y solo se diferencian
 * en estos cuatro datos. El mensaje de error usa `label` como sujeto de la frase, así que
 * incluye el artículo ("El avatar", "La portada") — así los textos existentes no cambian.
 */
interface ProfileImageSpec {
  readonly prefix: string;
  readonly column: 'avatarKey' | 'bannerKey';
  readonly maxMbConfigKey: string;
  readonly label: string;
}

const AVATAR_IMAGE: ProfileImageSpec = {
  prefix: 'avatars',
  column: 'avatarKey',
  maxMbConfigKey: 'uploads.maxAvatarMb',
  label: 'El avatar',
};

const BANNER_IMAGE: ProfileImageSpec = {
  prefix: 'banners',
  column: 'bannerKey',
  maxMbConfigKey: 'uploads.maxBannerMb',
  label: 'La portada',
};

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  username: string;
  cedula: string;
}

export class FeedSettingsView {
  @ApiProperty({ enum: FeedLayout })
  layout: FeedLayout;

  @ApiProperty()
  columns: number;

  @ApiProperty()
  gap: number;
}

export class UserPublicView {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: String })
  avatarUrl: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Portada de la cabecera de perfil (Fase 4.5). `null` si el usuario no subió ninguna: ' +
      'el cliente pinta su propia superficie, no una imagen de relleno.',
  })
  bannerUrl: string | null;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty({
    description:
      'Publicaciones (`kind: MEDIA`) del usuario. Visible también en la vista limitada de un ' +
      'perfil privado: dice cuánto hay, no qué hay.',
  })
  postsCount: number;

  @ApiProperty({
    description: 'Notas (`kind: NOTE`, Fase 4.6) del usuario. Misma visibilidad que `postsCount`.',
  })
  notesCount: number;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty()
  viewerFollows: boolean;

  @ApiProperty()
  followsViewer: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  bio?: string | null;

  @ApiPropertyOptional({ type: () => FeedSettingsView })
  feedSettings?: FeedSettingsView;
}

export class MeView extends UserPublicView {
  @ApiProperty()
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    // El grafo social (conteos, follows, regla de visibilidad) vive en `social`; `users` solo
    // lo consume. Ver la nota de `forwardRef` en `SocialService`.
    @Inject(forwardRef(() => SocialService)) private readonly socialService: SocialService,
    // El conteo de publicaciones del perfil (Fase 4.5) es un dato de `posts`: se pide por
    // servicio público, nunca contando su tabla desde aquí (regla 7). El ciclo que esto crea es
    // el mismo caso que `social` y está documentado en `ARCHITECTURE.md` (desviación 5).
    @Inject(forwardRef(() => PostsService)) private readonly postsService: PostsService,
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
    const publicView = await this.buildView(user, userId);
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
    const publicView = await this.buildView(updated, userId);
    return { ...publicView, email: updated.email, role: updated.role };
  }

  presignAvatar(userId: string, dto: PresignAvatarDto): Promise<PresignAvatarResponseDto> {
    return this.presignProfileImage(AVATAR_IMAGE, userId, dto);
  }

  updateAvatar(userId: string, dto: ConfirmAvatarDto): Promise<MeView> {
    return this.confirmProfileImage(AVATAR_IMAGE, userId, dto);
  }

  presignBanner(userId: string, dto: PresignAvatarDto): Promise<PresignAvatarResponseDto> {
    return this.presignProfileImage(BANNER_IMAGE, userId, dto);
  }

  updateBanner(userId: string, dto: ConfirmAvatarDto): Promise<MeView> {
    return this.confirmProfileImage(BANNER_IMAGE, userId, dto);
  }

  /**
   * Quitar la portada es un estado válido y querido (el avatar no tiene equivalente porque
   * siempre hay uno por defecto en la UI). Idempotente: sin portada, no hace nada y responde el
   * mismo `Me`.
   */
  async removeBanner(userId: string): Promise<MeView> {
    const user = await this.requireById(userId);
    if (!user.bannerKey) {
      return this.getMe(userId);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { bannerKey: null },
    });
    await this.deletePreviousImage(user.bannerKey, BANNER_IMAGE);
    const publicView = await this.buildView(updated, userId);
    return { ...publicView, email: updated.email, role: updated.role };
  }

  /**
   * Presign de una imagen de perfil (avatar o portada). Ambas siguen el mismo camino de la Fase
   * 0.5 —presign, PUT directo a S3, confirm— y se diferencian solo en prefijo, tope de peso y
   * columna; tenerlo escrito dos veces era la forma segura de que se desviaran con el tiempo.
   */
  private async presignProfileImage(
    image: ProfileImageSpec,
    userId: string,
    dto: PresignAvatarDto,
  ): Promise<PresignAvatarResponseDto> {
    if (!PROFILE_IMAGE_MIME_TYPES.includes(dto.mimeType)) {
      throw new UnsupportedMediaTypeException(
        `${image.label} debe ser una imagen JPEG, PNG o WEBP`,
      );
    }
    // Cada imagen de perfil tiene su propio tope (`UPLOAD_MAX_AVATAR_MB` /
    // `UPLOAD_MAX_BANNER_MB`), distinto del de una imagen de biblioteca: el avatar se muestra en
    // miniatura y la portada es ancha, ninguna necesita el peso de una obra publicada.
    const maxBytes = this.maxBytesFor(image);
    if (dto.size > maxBytes) {
      throw new PayloadTooLargeException(
        `${image.label} supera el tamaño máximo de ${Math.floor(maxBytes / BYTES_PER_MB)} MB`,
      );
    }

    const extension =
      dto.mimeType === 'image/png' ? '.png' : dto.mimeType === 'image/webp' ? '.webp' : '.jpg';
    const key = `${image.prefix}/${userId}/${randomUUID()}${extension}`;
    const expiresIn = this.configService.get<number>('s3.signedUrlExpiresIn') ?? 300;
    const uploadUrl = await this.storageService.getSignedUploadUrl(key, dto.mimeType, expiresIn);

    return { key, uploadUrl, expiresIn };
  }

  private async confirmProfileImage(
    image: ProfileImageSpec,
    userId: string,
    dto: ConfirmAvatarDto,
  ): Promise<MeView> {
    const expectedPrefix = `${image.prefix}/${userId}/`;
    if (!dto.key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('La key subida no corresponde a este usuario');
    }

    const uploaded = await this.storageService.headObject(dto.key);
    if (!uploaded) {
      throw new NotFoundException(
        `${image.label} todavía no llegó a S3; sube el binario antes de confirmar`,
      );
    }

    // La URL prefirmada no impone tamaño: el `size` del presign era una promesa del cliente.
    // El tamaño real solo lo sabe S3, y una imagen pasada de peso se borra en vez de quedar
    // huérfana en el bucket.
    const maxBytes = this.maxBytesFor(image);
    if (uploaded.size > maxBytes) {
      await this.storageService.delete(dto.key);
      throw new PayloadTooLargeException(
        `${image.label} supera el tamaño máximo de ${Math.floor(maxBytes / BYTES_PER_MB)} MB`,
      );
    }

    const user = await this.requireById(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { [image.column]: dto.key },
    });
    await this.deletePreviousImage(user[image.column], image);

    const publicView = await this.buildView(updated, userId);
    return { ...publicView, email: updated.email, role: updated.role };
  }

  /**
   * La imagen nueva ya está guardada y referenciada: borrar la anterior es limpieza, no parte
   * del cambio. Si S3 falla aquí, se registra y se deja la key huérfana en vez de responder 500
   * sobre una actualización que sí se aplicó.
   */
  private async deletePreviousImage(key: string | null, image: ProfileImageSpec): Promise<void> {
    if (!key) return;
    try {
      await this.storageService.delete(key);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar ${image.label.toLowerCase()} anterior (${key}): ${String(error)}`,
      );
    }
  }

  private maxBytesFor(image: ProfileImageSpec): number {
    return this.configService.get<number>(image.maxMbConfigKey)! * BYTES_PER_MB;
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
    return this.buildView(user, viewerId);
  }

  /**
   * ¿Puede `viewerId` ver el contenido de `ownerId`? La **decisión** vive en `social`
   * (`canView`: el dueño, un perfil público, o follow mutuo); aquí solo se carga el dueño,
   * que es el dato de este dominio.
   */
  async canViewContentOf(ownerId: string, viewerId?: string): Promise<boolean> {
    if (viewerId !== undefined && viewerId === ownerId) {
      return true;
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, isPublic: true },
    });
    if (!owner) return false;
    return this.socialService.canView(owner, viewerId);
  }

  /** De un conjunto de usuarios, cuáles son públicos. Lo usa el home feed para su stream S. */
  async filterPublicIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isPublic: true },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  /**
   * Ids de perfiles públicos, excluyendo los que se pasen. Alimenta el stream de descubrimiento
   * del home feed. *Límite conocido:* trae todos los ids públicos; a partir de unos miles de
   * usuarios habrá que denormalizar `isPublic` en `Post` o materializar el stream (anotado en
   * `docs/STATUS.md`), porque `posts` no puede unir con la tabla `users` (regla 7).
   */
  async findPublicUserIds(excludeIds: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { isPublic: true, ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}) },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  /**
   * `UserPublic` de varios usuarios de una sola vez, indexado por id. Lo usan los módulos que
   * embeben autores en sus respuestas (`posts`) sin consultar la tabla `users` por su cuenta.
   */
  async getPublicViewsByIds(
    ids: string[],
    viewerId?: string,
  ): Promise<Map<string, UserPublicView>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();

    const users = await this.prisma.user.findMany({ where: { id: { in: unique } } });
    const userIds = users.map((user) => user.id);
    // Un solo viaje al grafo y uno solo al conteo de publicaciones/notas para todos los usuarios
    // de la página, no dos consultas por cada uno.
    const [graph, postCounts, noteCounts] = await Promise.all([
      this.socialService.getGraphInfoFor(userIds, viewerId),
      this.postsService.countByAuthorIds(userIds, PostKind.MEDIA),
      this.postsService.countByAuthorIds(userIds, PostKind.NOTE),
    ]);
    const views = await Promise.all(
      users.map(
        async (user) =>
          [
            user.id,
            await this.buildView(
              user,
              viewerId,
              graph.get(user.id),
              postCounts.get(user.id) ?? 0,
              noteCounts.get(user.id) ?? 0,
            ),
          ] as const,
      ),
    );
    return new Map(views);
  }

  /**
   * `UserPublic` de un usuario: datos del perfil + lo que aporta el grafo social, y la vista
   * extendida (bio y ajustes de feed) solo para quien puede ver su contenido — la decisión la
   * toma `social`, que es donde vive la regla.
   */
  private async buildView(
    user: User,
    viewerId?: string,
    graph?: SocialGraphInfo,
    postsCount?: number,
    notesCount?: number,
  ): Promise<UserPublicView> {
    const [info, countedPosts, countedNotes] = await Promise.all([
      graph ?? this.socialService.getGraphInfoFor([user.id], viewerId).then((m) => m.get(user.id)!),
      postsCount ??
        this.postsService
          .countByAuthorIds([user.id], PostKind.MEDIA)
          .then((m) => m.get(user.id) ?? 0),
      notesCount ??
        this.postsService
          .countByAuthorIds([user.id], PostKind.NOTE)
          .then((m) => m.get(user.id) ?? 0),
    ]);
    const includeExtended = this.socialService.canViewWithGraph(user, viewerId, info);
    return this.toUserPublic(user, {
      includeExtended,
      graph: info,
      postsCount: countedPosts,
      notesCount: countedNotes,
    });
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
    opts: {
      includeExtended: boolean;
      graph: SocialGraphInfo;
      postsCount: number;
      notesCount: number;
    },
  ): Promise<UserPublicView> {
    const [avatarUrl, bannerUrl] = await Promise.all([
      user.avatarKey ? this.storageService.getSignedDownloadUrl(user.avatarKey) : null,
      user.bannerKey ? this.storageService.getSignedDownloadUrl(user.bannerKey) : null,
    ]);

    const base: UserPublicView = {
      id: user.id,
      username: user.username,
      name: user.name ?? '',
      avatarUrl,
      bannerUrl,
      isPublic: user.isPublic,
      postsCount: opts.postsCount,
      notesCount: opts.notesCount,
      followersCount: opts.graph.followersCount,
      followingCount: opts.graph.followingCount,
      viewerFollows: opts.graph.viewerFollows,
      followsViewer: opts.graph.followsViewer,
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
