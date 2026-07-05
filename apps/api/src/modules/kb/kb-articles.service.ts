import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { HelpArticle } from '../../database/entities';
import {
  ArticleResponseDto,
  ArticleSummaryDto,
  CreateArticleDto,
  PaginatedArticlesDto,
  QueryArticlesDto,
  UpdateArticleDto,
} from './dto/article.dto';
import { KbCategoriesService } from './kb-categories.service';

@Injectable()
export class KbArticlesService {
  constructor(
    @InjectRepository(HelpArticle)
    private readonly articlesRepository: Repository<HelpArticle>,
    private readonly categoriesService: KbCategoriesService,
  ) {}

  async list(
    workspaceId: string,
    query: QueryArticlesDto,
  ): Promise<PaginatedArticlesDto> {
    const qb = this.baseQuery(workspaceId);

    if (query.categoryId) {
      qb.andWhere('a.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.published !== undefined) {
      qb.andWhere('a.is_published = :published', {
        published: query.published,
      });
    }
    if (query.search) {
      // Relevance ranking wins while searching; sortBy applies otherwise.
      this.applySearch(qb, query.search);
    } else {
      const SORT_COLUMNS: Record<typeof query.sortBy, string> = {
        updatedAt: 'a.updated_at',
        createdAt: 'a.created_at',
        title: 'a.title',
      };
      qb.orderBy(SORT_COLUMNS[query.sortBy], query.sortOrder);
    }

    qb.offset(query.skip).limit(query.limit);
    const [articles, total] = await qb.getManyAndCount();
    return {
      data: articles.map((a) => this.toSummary(a)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getById(
    workspaceId: string,
    articleId: string,
  ): Promise<ArticleResponseDto> {
    const article = await this.articlesRepository.findOne({
      where: { id: articleId, workspaceId },
      relations: { category: true, createdByUser: true, updatedByUser: true },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return this.toDetail(article);
  }

  async create(
    workspaceId: string,
    author: AuthenticatedUser,
    dto: CreateArticleDto,
  ): Promise<ArticleResponseDto> {
    // 404s for a foreign/unknown category before any write.
    await this.categoriesService.findInWorkspace(workspaceId, dto.categoryId);

    const article = await this.articlesRepository.save(
      this.articlesRepository.create({
        workspaceId,
        categoryId: dto.categoryId,
        title: dto.title,
        slug: await this.uniqueSlug(workspaceId, dto.title),
        content: dto.content,
        excerpt: dto.excerpt ?? null,
        isPublished: dto.isPublished ?? false,
        createdByUserId: author.id,
        updatedByUserId: author.id,
      }),
    );
    return this.getById(workspaceId, article.id);
  }

  async update(
    workspaceId: string,
    articleId: string,
    editor: AuthenticatedUser,
    dto: UpdateArticleDto,
  ): Promise<ArticleResponseDto> {
    const article = await this.articlesRepository.findOne({
      where: { id: articleId, workspaceId },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    if (dto.categoryId && dto.categoryId !== article.categoryId) {
      await this.categoriesService.findInWorkspace(
        workspaceId,
        dto.categoryId,
      );
      article.categoryId = dto.categoryId;
    }
    if (dto.title !== undefined && dto.title !== article.title) {
      article.title = dto.title;
      // Slug follows the title only while unpublished — published URLs
      // may already be linked from customer sites and must stay stable.
      if (!article.isPublished) {
        article.slug = await this.uniqueSlug(workspaceId, dto.title);
      }
    }
    if (dto.content !== undefined) article.content = dto.content;
    if (dto.excerpt !== undefined) article.excerpt = dto.excerpt || null;
    if (dto.isPublished !== undefined) article.isPublished = dto.isPublished;
    article.updatedByUserId = editor.id;

    await this.articlesRepository.save(article);
    return this.getById(workspaceId, article.id);
  }

  async remove(workspaceId: string, articleId: string): Promise<void> {
    const article = await this.articlesRepository.findOne({
      where: { id: articleId, workspaceId },
    });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    await this.articlesRepository.remove(article);
  }

  /**
   * Search abstraction: weighted Postgres full-text search against the
   * generated search_vector column (GIN-indexed, title > excerpt >
   * content), ranked by ts_rank. Swapping in an external engine later
   * only touches this method.
   */
  applySearch(qb: SelectQueryBuilder<HelpArticle>, terms: string): void {
    qb.andWhere("a.search_vector @@ plainto_tsquery('english', :terms)", {
      terms,
    }).orderBy(
      "ts_rank(a.search_vector, plainto_tsquery('english', :terms))",
      'DESC',
    );
  }

  private baseQuery(workspaceId: string): SelectQueryBuilder<HelpArticle> {
    return this.articlesRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.category', 'category')
      .leftJoinAndSelect('a.updatedByUser', 'updatedBy')
      .where('a.workspace_id = :workspaceId', { workspaceId });
  }

  /** "How to Install?" -> how-to-install, deduped per workspace (-2, -3…). */
  private async uniqueSlug(
    workspaceId: string,
    title: string,
  ): Promise<string> {
    const base =
      title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200) || 'article';

    const taken = new Set(
      (
        await this.articlesRepository
          .createQueryBuilder('a')
          .select('a.slug', 'slug')
          .where('a.workspace_id = :workspaceId', { workspaceId })
          .andWhere('a.slug LIKE :like', { like: `${base}%` })
          .getRawMany<{ slug: string }>()
      ).map((row) => row.slug),
    );

    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private toSummary(article: HelpArticle): ArticleSummaryDto {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      isPublished: article.isPublished,
      categoryId: article.categoryId,
      categoryName: article.category?.name ?? '',
      updatedByName: article.updatedByUser?.name ?? null,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }

  private toDetail(article: HelpArticle): ArticleResponseDto {
    return {
      ...this.toSummary(article),
      content: article.content,
      createdByName: article.createdByUser?.name ?? null,
    };
  }
}
