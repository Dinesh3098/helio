import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { AiService } from './ai.service';
import {
  ClassificationResponseDto,
  GeneratedTextResponseDto,
  KbSuggestionDto,
  RewriteDto,
  SuggestReplyDto,
  SummaryResponseDto,
} from './dto/ai.dto';

const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

/**
 * Agent-assist AI. Every endpoint returns text/data for the agent to
 * review — nothing here ever sends a message to a customer.
 */
@ApiTags('ai')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard, AiRateLimitGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('conversations/:conversationId/summary')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Cached summary (404 when none generated yet)' })
  @ApiOkResponse({ type: SummaryResponseDto })
  async getSummary(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<SummaryResponseDto> {
    const summary = await this.aiService.getSummary(
      membership.workspaceId,
      conversationId,
    );
    if (!summary) {
      throw new NotFoundException('No summary generated yet');
    }
    return summary;
  }

  @Post('conversations/:conversationId/summary')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate the summary (returns the cached one when still fresh)',
  })
  @ApiOkResponse({ type: SummaryResponseDto })
  generateSummary(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<SummaryResponseDto> {
    return this.aiService.generateSummary(
      membership.workspaceId,
      conversationId,
    );
  }

  @Post('conversations/:conversationId/reply')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Draft a suggested reply (never sent automatically)',
  })
  @ApiOkResponse({ type: GeneratedTextResponseDto })
  async suggestReply(
    @CurrentMembership() membership: WorkspaceMember,
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: SuggestReplyDto,
  ): Promise<GeneratedTextResponseDto> {
    const text = await this.aiService.suggestReply(
      membership.workspaceId,
      conversationId,
      user,
      dto.instructions,
    );
    return { text };
  }

  @Post('rewrite')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rewrite a draft in a given style' })
  @ApiOkResponse({ type: GeneratedTextResponseDto })
  async rewrite(@Body() dto: RewriteDto): Promise<GeneratedTextResponseDto> {
    const text = await this.aiService.rewrite(dto.draft, dto.style);
    return { text };
  }

  @Post('conversations/:conversationId/classify')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Classify category, priority, sentiment, and intent',
  })
  @ApiOkResponse({ type: ClassificationResponseDto })
  classify(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<ClassificationResponseDto> {
    return this.aiService.classify(membership.workspaceId, conversationId);
  }

  @Post('conversations/:conversationId/kb')
  @Roles(...ALL_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suggest relevant published KB articles' })
  @ApiOkResponse({ type: KbSuggestionDto, isArray: true })
  suggestArticles(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<KbSuggestionDto[]> {
    return this.aiService.suggestArticles(
      membership.workspaceId,
      conversationId,
    );
  }
}
