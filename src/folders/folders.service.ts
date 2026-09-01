import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Folder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

/**
 * Tope de saltos al subir por el árbol. Un árbol sano nunca lo alcanza (la ruta termina en
 * `parentId: null`); existe para que un ciclo dejado por una escritura fuera de este servicio
 * no cuelgue el proceso en un `while` infinito.
 */
const MAX_TREE_DEPTH = 64;

/** Un eslabón del breadcrumb: de la raíz hasta la carpeta pedida, ella incluida. */
export interface FolderPathItem {
  id: string;
  name: string;
}

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Carpetas hijas directas de `parentId` (raíz si es `null`). La biblioteca se navega nivel a
   * nivel, no en un árbol completo: una carpeta con 300 hijas no debe traerse entera.
   */
  async findAllForUser(userId: string, parentId: string | null = null) {
    if (parentId !== null) {
      await this.findOneOrFail(parentId, userId);
    }
    return this.prisma.folder.findMany({
      where: { userId, parentId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { files: true, children: true } } },
    });
  }

  async findOneOrFail(id: string, userId: string): Promise<Folder> {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      throw new NotFoundException('Carpeta no encontrada');
    }
    if (folder.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a esta carpeta');
    }
    return folder;
  }

  /** Carpeta + su breadcrumb, que es lo que las dos vistas de detalle necesitan para navegar. */
  async findOneWithPath(id: string, userId: string) {
    const folder = await this.findOneOrFail(id, userId);
    const [count, path] = await Promise.all([
      this.prisma.folder.findUnique({
        where: { id },
        select: { _count: { select: { files: true, children: true } } },
      }),
      this.buildPath(folder),
    ]);
    return { ...folder, _count: count!._count, path };
  }

  async create(userId: string, dto: CreateFolderDto) {
    const parentId = dto.parentId ?? null;
    if (parentId !== null) {
      await this.findOneOrFail(parentId, userId);
    }
    await this.assertNameFree(userId, parentId, dto.name);
    return this.prisma.folder.create({ data: { name: dto.name, userId, parentId } });
  }

  /**
   * Renombra y/o mueve. `parentId` ausente = no se mueve; `parentId: null` = va a la raíz.
   * (`class-transformer` solo asigna las claves presentes en el body, así que `undefined` y
   * `null` sí se distinguen aquí.)
   */
  async update(id: string, userId: string, dto: UpdateFolderDto) {
    const folder = await this.findOneOrFail(id, userId);

    const moving = dto.parentId !== undefined;
    const parentId = moving ? (dto.parentId ?? null) : folder.parentId;
    const name = dto.name ?? folder.name;

    if (moving && parentId !== folder.parentId) {
      await this.assertMoveIsLegal(folder, parentId, userId);
    }
    if (parentId !== folder.parentId || name !== folder.name) {
      await this.assertNameFree(userId, parentId, name, id);
    }

    return this.prisma.folder.update({ where: { id }, data: { name, parentId } });
  }

  async remove(id: string, userId: string) {
    await this.findOneOrFail(id, userId);
    // La FK autorreferente es ON DELETE CASCADE: borrar una carpeta se lleva sus sub-carpetas
    // y, por la FK de `file_assets`, las filas de sus archivos.
    await this.prisma.folder.delete({ where: { id } });
  }

  private async buildPath(folder: Folder): Promise<FolderPathItem[]> {
    const path: FolderPathItem[] = [{ id: folder.id, name: folder.name }];
    let currentParentId = folder.parentId;
    for (let depth = 0; depth < MAX_TREE_DEPTH && currentParentId !== null; depth += 1) {
      const parent = await this.prisma.folder.findUnique({
        where: { id: currentParentId },
        select: { id: true, name: true, parentId: true },
      });
      if (!parent) break;
      path.unshift({ id: parent.id, name: parent.name });
      currentParentId = parent.parentId;
    }
    return path;
  }

  /**
   * Una carpeta no puede colgar de sí misma ni de una de sus descendientes: eso dejaría un
   * ciclo que ninguna consulta podría recorrer y perdería el subárbol de la vista.
   */
  private async assertMoveIsLegal(
    folder: Folder,
    newParentId: string | null,
    userId: string,
  ): Promise<void> {
    if (newParentId === null) return;
    if (newParentId === folder.id) {
      throw new BadRequestException('Una carpeta no puede ser su propia carpeta madre');
    }

    const newParent = await this.findOneOrFail(newParentId, userId);

    let ancestorId = newParent.parentId;
    for (let depth = 0; depth < MAX_TREE_DEPTH && ancestorId !== null; depth += 1) {
      if (ancestorId === folder.id) {
        throw new BadRequestException(
          'No puedes mover una carpeta dentro de una de sus sub-carpetas',
        );
      }
      const ancestor: { parentId: string | null } | null = await this.prisma.folder.findUnique({
        where: { id: ancestorId },
        select: { parentId: true },
      });
      if (!ancestor) break;
      ancestorId = ancestor.parentId;
    }
  }

  /**
   * Unicidad de nombre entre hermanos, validada antes de escribir para responder 409 y no un
   * error crudo de Prisma. Los índices de la base son la red de seguridad, no la validación.
   */
  private async assertNameFree(
    userId: string,
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const sibling = await this.prisma.folder.findFirst({
      where: { userId, parentId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (sibling) {
      throw new ConflictException(
        parentId === null
          ? 'Ya tienes una carpeta con ese nombre'
          : 'Ya tienes una sub-carpeta con ese nombre en esta carpeta',
      );
    }
  }
}
