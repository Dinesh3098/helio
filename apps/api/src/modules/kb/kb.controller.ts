import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { WorkspaceMember, WorkspaceMemberRole } from "../../database/entities";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ArticleResponseDto,
  CreateArticleDto,
  PaginatedArticlesDto,
  QueryArticlesDto,
  UpdateArticleDto,
} from "./dto/article.dto";
import {
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from "./dto/category.dto";
import { KbArticlesService } from "./kb-articles.service";
import { KbCategoriesService } from "./kb-categories.service";

// Agents write help docs too — all roles manage KB content.
const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

@ApiTags("knowledge base")
@ApiBearerAuth()
@ApiHeader({
  name: "x-workspace-id",
  required: false,
  description:
    "Workspace to operate on. Optional when the user belongs to exactly one workspace.",
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("kb")
export class KbController {
  constructor(
    private readonly categoriesService: KbCategoriesService,
    private readonly articlesService: KbArticlesService,
  ) {}

  // ---------- Categories ----------

  @Get("categories")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "List categories with article counts" })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  listCategories(
    @CurrentMembership() membership: WorkspaceMember,
  ): Promise<CategoryResponseDto[]> {
    return this.categoriesService.list(membership.workspaceId);
  }

  @Get("categories/:id")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Category detail with article counts" })
  @ApiOkResponse({ type: CategoryResponseDto })
  getCategory(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.getOne(membership.workspaceId, id);
  }

  @Post("categories")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Create a category" })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  createCategory(
    @CurrentMembership() membership: WorkspaceMember,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.create(membership.workspaceId, dto);
  }

  @Patch("categories/:id")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Rename / reorder a category" })
  @ApiOkResponse({ type: CategoryResponseDto })
  updateCategory(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(membership.workspaceId, id, dto);
  }

  @Delete("categories/:id")
  // Destructive and structural — reserved for OWNER/ADMIN, unlike article
  // editing which every workspace member can do.
  @Roles(WorkspaceMemberRole.OWNER, WorkspaceMemberRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Delete an empty category (409 if it has articles; owner/admin only)",
  })
  async deleteCategory(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.categoriesService.remove(membership.workspaceId, id);
  }

  // ---------- Articles ----------

  @Get("articles")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "List articles (search, filters, paginated)" })
  @ApiOkResponse({ type: PaginatedArticlesDto })
  listArticles(
    @CurrentMembership() membership: WorkspaceMember,
    @Query() query: QueryArticlesDto,
  ): Promise<PaginatedArticlesDto> {
    return this.articlesService.list(membership.workspaceId, query);
  }

  @Get("articles/:id")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Article detail (including draft content)" })
  @ApiOkResponse({ type: ArticleResponseDto })
  getArticle(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.getById(membership.workspaceId, id);
  }

  @Post("articles")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Create an article (slug auto-generated)" })
  @ApiCreatedResponse({ type: ArticleResponseDto })
  createArticle(
    @CurrentMembership() membership: WorkspaceMember,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateArticleDto,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.create(membership.workspaceId, user, dto);
  }

  @Patch("articles/:id")
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Update an article (incl. publish/unpublish)" })
  @ApiOkResponse({ type: ArticleResponseDto })
  updateArticle(
    @CurrentMembership() membership: WorkspaceMember,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.update(membership.workspaceId, id, user, dto);
  }

  @Delete("articles/:id")
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an article" })
  async deleteArticle(
    @CurrentMembership() membership: WorkspaceMember,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.articlesService.remove(membership.workspaceId, id);
  }
}
