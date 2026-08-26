import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(userId: string) {
    return this.prisma.folder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { files: true } } },
    });
  }

  async findOneOrFail(id: string, userId: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      throw new NotFoundException('Carpeta no encontrada');
    }
    if (folder.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a esta carpeta');
    }
    return folder;
  }

  async create(userId: string, dto: CreateFolderDto) {
    const existing = await this.prisma.folder.findUnique({
      where: { userId_name: { userId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('Ya tienes una carpeta con ese nombre');
    }
    return this.prisma.folder.create({ data: { name: dto.name, userId } });
  }

  async update(id: string, userId: string, dto: UpdateFolderDto) {
    await this.findOneOrFail(id, userId);
    return this.prisma.folder.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.findOneOrFail(id, userId);
    await this.prisma.folder.delete({ where: { id } });
  }
}
