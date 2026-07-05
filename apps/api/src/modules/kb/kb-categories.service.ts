import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpArticle, HelpCategory } from '../../database/entities';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

@Injectable()
export class KbCategoriesService {
  constructor(
    @InjectRepository(HelpCategory)
    private readonly categoriesRepository: Repository<HelpCategory>,
    @InjectRepository(HelpArticle)
    private readonly articlesRepository: Repository<HelpArticle>,
  ) {}

  async list(workspaceId: string): Promise<CategoryResponseDto[]> {
    const categories = await this.categoriesRepository.find({
      where: { workspaceId },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
    if (categories.length === 0) return [];

    // One grouped query for all counts — no per-category roundtrips.
    const counts = await this.articlesRepository
      .createQueryBuilder('a')
      .select('a.category_id', 'categoryId')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        "COUNT(*) FILTER (WHERE a.is_published)::int",
        'published',
      )
      .where('a.workspace_id = :workspaceId', { workspaceId })
      .groupBy('a.category_id')
      .getRawMany<{ categoryId: string; total: number; published: number }>();
    const byCategory = new Map(counts.map((c) => [c.categoryId, c]));

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      displayOrder: category.displayOrder,
      articlesCount: byCategory.get(category.id)?.total ?? 0,
      publishedCount: byCategory.get(category.id)?.published ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }));
  }

  async create(
    workspaceId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existing = await this.categoriesRepository.findOne({
      where: { workspaceId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    const category = await this.categoriesRepository.save(
      this.categoriesRepository.create({
        workspaceId,
        name: dto.name,
        displayOrder: dto.displayOrder ?? 0,
      }),
    );
    return { ...this.toBase(category), articlesCount: 0, publishedCount: 0 };
  }

  async update(
    workspaceId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.findInWorkspace(workspaceId, categoryId);

    if (dto.name !== undefined && dto.name !== category.name) {
      const duplicate = await this.categoriesRepository.findOne({
        where: { workspaceId, name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException(
          'A category with this name already exists',
        );
      }
      category.name = dto.name;
    }
    if (dto.displayOrder !== undefined) {
      category.displayOrder = dto.displayOrder;
    }
    await this.categoriesRepository.save(category);

    const articlesCount = await this.articlesRepository.count({
      where: { workspaceId, categoryId },
    });
    const publishedCount = await this.articlesRepository.count({
      where: { workspaceId, categoryId, isPublished: true },
    });
    return { ...this.toBase(category), articlesCount, publishedCount };
  }

  async remove(workspaceId: string, categoryId: string): Promise<void> {
    const category = await this.findInWorkspace(workspaceId, categoryId);
    const articlesCount = await this.articlesRepository.count({
      where: { workspaceId, categoryId },
    });
    // Explicit 409 beats surfacing the FK RESTRICT as a 500.
    if (articlesCount > 0) {
      throw new ConflictException(
        'Move or delete the articles in this category first',
      );
    }
    await this.categoriesRepository.remove(category);
  }

  async findInWorkspace(
    workspaceId: string,
    categoryId: string,
  ): Promise<HelpCategory> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, workspaceId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private toBase(category: HelpCategory) {
    return {
      id: category.id,
      name: category.name,
      displayOrder: category.displayOrder,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
