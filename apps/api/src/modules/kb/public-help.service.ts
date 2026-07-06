import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HelpArticle, HelpCategory, Workspace } from "../../database/entities";
import {
  PublicArticleDto,
  PublicArticleSummaryDto,
  PublicHelpCenterDto,
} from "./dto/public-help.dto";
import { KbArticlesService } from "./kb-articles.service";

/**
 * Unauthenticated help-center reads. Every query is pinned to a validated
 * workspace and to is_published = true — drafts are invisible here no
 * matter what is requested.
 */
@Injectable()
export class PublicHelpService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
    @InjectRepository(HelpCategory)
    private readonly categoriesRepository: Repository<HelpCategory>,
    @InjectRepository(HelpArticle)
    private readonly articlesRepository: Repository<HelpArticle>,
    private readonly articlesService: KbArticlesService,
  ) {}

  async getHelpCenter(workspaceId: string): Promise<PublicHelpCenterDto> {
    const workspace = await this.requireWorkspace(workspaceId);

    const [categories, articles] = await Promise.all([
      this.categoriesRepository.find({
        where: { workspaceId },
        order: { displayOrder: "ASC", name: "ASC" },
      }),
      this.articlesRepository.find({
        where: { workspaceId, isPublished: true },
        select: {
          id: true,
          categoryId: true,
          title: true,
          slug: true,
          excerpt: true,
          updatedAt: true,
        },
        order: { updatedAt: "DESC" },
      }),
    ]);

    const byCategory = new Map<string, PublicArticleSummaryDto[]>();
    for (const article of articles) {
      const list = byCategory.get(article.categoryId) ?? [];
      list.push(this.toSummary(article));
      byCategory.set(article.categoryId, list);
    }

    return {
      workspaceName: workspace.name,
      // Empty categories are noise on a public help center.
      categories: categories
        .filter((category) => byCategory.has(category.id))
        .map((category) => ({
          id: category.id,
          name: category.name,
          articles: byCategory.get(category.id) ?? [],
        })),
    };
  }

  async getArticleBySlug(
    workspaceId: string,
    slug: string,
  ): Promise<PublicArticleDto> {
    const workspace = await this.requireWorkspace(workspaceId);
    const article = await this.articlesRepository.findOne({
      where: { workspaceId, slug, isPublished: true },
      relations: { category: true },
    });
    if (!article) {
      throw new NotFoundException("Article not found");
    }
    return {
      ...this.toSummary(article),
      content: article.content,
      categoryName: article.category.name,
      workspaceName: workspace.name,
    };
  }

  async search(
    workspaceId: string,
    terms: string,
    limit: number,
  ): Promise<PublicArticleSummaryDto[]> {
    await this.requireWorkspace(workspaceId);

    const qb = this.articlesRepository
      .createQueryBuilder("a")
      .where("a.workspace_id = :workspaceId", { workspaceId })
      .andWhere("a.is_published = true")
      .limit(limit);
    // Same weighted FTS the dashboard uses.
    this.articlesService.applySearch(qb, terms);

    const articles = await qb.getMany();
    return articles.map((article) => this.toSummary(article));
  }

  private async requireWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }
    return workspace;
  }

  private toSummary(article: HelpArticle): PublicArticleSummaryDto {
    return {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      updatedAt: article.updatedAt,
    };
  }
}
