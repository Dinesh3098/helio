import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  HelpSearchQueryDto,
  HelpWorkspaceQueryDto,
  PublicArticleDto,
  PublicArticleSummaryDto,
  PublicHelpCenterDto,
} from "./dto/public-help.dto";
import { PublicHelpService } from "./public-help.service";

/** Public, unauthenticated help center. Published articles only. */
@ApiTags("help center (public)")
@Controller("help")
export class PublicHelpController {
  constructor(private readonly publicHelpService: PublicHelpService) {}

  @Get()
  @ApiOperation({
    summary: "Help center home: categories + published articles",
  })
  @ApiOkResponse({ type: PublicHelpCenterDto })
  getHelpCenter(
    @Query() query: HelpWorkspaceQueryDto,
  ): Promise<PublicHelpCenterDto> {
    return this.publicHelpService.getHelpCenter(query.workspaceId);
  }

  @Get("categories")
  @ApiOperation({ summary: "Alias of GET /help (same payload)" })
  @ApiOkResponse({ type: PublicHelpCenterDto })
  getCategories(
    @Query() query: HelpWorkspaceQueryDto,
  ): Promise<PublicHelpCenterDto> {
    return this.publicHelpService.getHelpCenter(query.workspaceId);
  }

  @Get("search")
  @ApiOperation({ summary: "Full-text search across published articles" })
  @ApiOkResponse({ type: PublicArticleSummaryDto, isArray: true })
  search(
    @Query() query: HelpSearchQueryDto,
  ): Promise<PublicArticleSummaryDto[]> {
    return this.publicHelpService.search(
      query.workspaceId,
      query.q,
      query.limit,
    );
  }

  @Get("articles/:slug")
  @ApiOperation({ summary: "Published article by slug" })
  @ApiOkResponse({ type: PublicArticleDto })
  getArticle(
    @Param("slug") slug: string,
    @Query() query: HelpWorkspaceQueryDto,
  ): Promise<PublicArticleDto> {
    return this.publicHelpService.getArticleBySlug(query.workspaceId, slug);
  }
}
