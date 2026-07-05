import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  Conversation,
  ConversationSummary,
  HelpArticle,
  Workspace,
} from '../../database/entities';
import { QueryMessagesDto } from '../messages/dto/query-messages.dto';
import { MessagesService } from '../messages/messages.service';
import {
  ClassificationResponseDto,
  KbSuggestionDto,
  SummaryResponseDto,
} from './dto/ai.dto';
import { classifyPrompt, CLASSIFY_SCHEMA } from './prompts/classify.prompt';
import { conversationSummaryPrompt } from './prompts/conversation-summary.prompt';
import { kbSearchPrompt } from './prompts/kb-search.prompt';
import { rewritePrompt, RewriteStyle } from './prompts/rewrite.prompt';
import { suggestedReplyPrompt } from './prompts/suggested-reply.prompt';
import { formatTranscript } from './prompts/transcript';
import {
  AI_PROVIDER,
  AiProviderError,
  type AiProvider,
} from './providers/ai-provider.interface';

/** Transcript cap: the newest page of messages (backend max page size). */
const TRANSCRIPT_LIMIT = 100;
const KB_SUGGESTION_LIMIT = 3;
const KB_CATALOG_LIMIT = 100;

@Injectable()
export class AiService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    @InjectRepository(ConversationSummary)
    private readonly summariesRepository: Repository<ConversationSummary>,
    @InjectRepository(HelpArticle)
    private readonly articlesRepository: Repository<HelpArticle>,
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
    private readonly messagesService: MessagesService,
  ) {}

  // ---------- Feature 1: summary ----------

  async getSummary(
    workspaceId: string,
    conversationId: string,
  ): Promise<SummaryResponseDto | null> {
    const conversation = await this.findConversation(
      workspaceId,
      conversationId,
    );
    const summary = await this.summariesRepository.findOne({
      where: { conversationId: conversation.id },
    });
    if (!summary) return null;
    return this.toSummaryResponse(summary, conversation);
  }

  /**
   * Cache-aware generation: a summary generated after the conversation's
   * last message is still valid and returned as-is; anything else calls
   * the model and overwrites the single per-conversation row. Staleness
   * derives from lastMessageAt vs the summary's updatedAt — no extra
   * bookkeeping column needed.
   */
  async generateSummary(
    workspaceId: string,
    conversationId: string,
  ): Promise<SummaryResponseDto> {
    const conversation = await this.findConversation(
      workspaceId,
      conversationId,
    );

    const existing = await this.summariesRepository.findOne({
      where: { conversationId: conversation.id },
    });
    if (existing && !this.isStale(existing, conversation)) {
      return this.toSummaryResponse(existing, conversation);
    }

    const transcript = await this.loadTranscript(workspaceId, conversationId);
    if (!transcript) {
      throw new HttpException(
        'This conversation has no messages to summarize',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const text = await this.callModel({
      prompt: conversationSummaryPrompt({
        contactName: conversation.contact.name,
        transcript,
      }),
    });

    const summary = await this.summariesRepository.save(
      this.summariesRepository.create({
        ...(existing ? { id: existing.id } : {}),
        conversationId: conversation.id,
        summary: text,
        model: this.provider.model,
      }),
    );
    return this.toSummaryResponse(summary, conversation);
  }

  // ---------- Feature 2: suggested reply ----------

  async suggestReply(
    workspaceId: string,
    conversationId: string,
    agent: AuthenticatedUser,
    instructions?: string,
  ): Promise<string> {
    const conversation = await this.findConversation(
      workspaceId,
      conversationId,
    );
    const transcript = await this.loadTranscript(workspaceId, conversationId);
    if (!transcript) {
      throw new HttpException(
        'This conversation has no messages to reply to',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });

    return this.callModel({
      prompt: suggestedReplyPrompt({
        contactName: conversation.contact.name,
        agentName: agent.name,
        workspaceName: workspace?.name ?? 'our company',
        transcript,
        instructions,
      }),
      temperature: 0.6,
    });
  }

  // ---------- Feature 3: rewrite ----------

  async rewrite(draft: string, style: RewriteStyle): Promise<string> {
    return this.callModel({
      prompt: rewritePrompt({ draft, style }),
      temperature: style === 'GRAMMAR' ? 0.1 : 0.5,
    });
  }

  // ---------- Feature 4: classification ----------

  async classify(
    workspaceId: string,
    conversationId: string,
  ): Promise<ClassificationResponseDto> {
    await this.findConversation(workspaceId, conversationId);
    const transcript = await this.loadTranscript(workspaceId, conversationId);
    if (!transcript) {
      throw new HttpException(
        'This conversation has no messages to classify',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const raw = await this.callModel({
      prompt: classifyPrompt({ transcript }),
      json: true,
      temperature: 0.1,
    });

    const parsed = this.parseJson<Partial<ClassificationResponseDto>>(raw);
    const priority = (parsed.priority ?? '').toUpperCase();
    const sentiment = (parsed.sentiment ?? '').toUpperCase();
    return {
      category: parsed.category?.trim() || 'Other',
      priority: (CLASSIFY_SCHEMA.priorities as readonly string[]).includes(
        priority,
      )
        ? priority
        : 'MEDIUM',
      sentiment: (CLASSIFY_SCHEMA.sentiments as readonly string[]).includes(
        sentiment,
      )
        ? sentiment
        : 'NEUTRAL',
      intent: parsed.intent?.trim() || 'General inquiry',
    };
  }

  // ---------- Feature 5: KB suggestions ----------

  async suggestArticles(
    workspaceId: string,
    conversationId: string,
  ): Promise<KbSuggestionDto[]> {
    await this.findConversation(workspaceId, conversationId);
    const transcript = await this.loadTranscript(workspaceId, conversationId);
    if (!transcript) return [];

    // Published only — suggestions exist to be shared with the customer.
    const articles = await this.articlesRepository.find({
      where: { workspaceId, isPublished: true },
      select: { id: true, title: true, slug: true, excerpt: true },
      take: KB_CATALOG_LIMIT,
      order: { updatedAt: 'DESC' },
    });
    if (articles.length === 0) return [];

    const raw = await this.callModel({
      prompt: kbSearchPrompt({
        transcript,
        articles,
        maxResults: KB_SUGGESTION_LIMIT,
      }),
      json: true,
      temperature: 0.1,
    });

    const parsed = this.parseJson<{ articleId?: string; reason?: string }[]>(
      raw,
    );
    if (!Array.isArray(parsed)) return [];

    // Only ids that actually exist in this workspace survive — the model
    // cannot inject or hallucinate articles.
    const byId = new Map(articles.map((article) => [article.id, article]));
    const suggestions: KbSuggestionDto[] = [];
    for (const item of parsed) {
      const article = item.articleId ? byId.get(item.articleId) : undefined;
      if (article && suggestions.length < KB_SUGGESTION_LIMIT) {
        suggestions.push({
          articleId: article.id,
          title: article.title,
          slug: article.slug,
          reason: item.reason?.trim() || 'Relevant to this conversation',
        });
      }
    }
    return suggestions;
  }

  // ---------- internals ----------

  private async findConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationsRepository.findOne({
      where: { id: conversationId, workspaceId },
      relations: { contact: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private async loadTranscript(
    workspaceId: string,
    conversationId: string,
  ): Promise<string> {
    const query = Object.assign(new QueryMessagesDto(), {
      limit: TRANSCRIPT_LIMIT,
    });
    const page = await this.messagesService.listForConversation(
      workspaceId,
      conversationId,
      query,
    );
    return formatTranscript(page.data);
  }

  private isStale(
    summary: ConversationSummary,
    conversation: Conversation,
  ): boolean {
    if (!conversation.lastMessageAt) return false;
    return conversation.lastMessageAt > summary.updatedAt;
  }

  private toSummaryResponse(
    summary: ConversationSummary,
    conversation: Conversation,
  ): SummaryResponseDto {
    return {
      summary: summary.summary,
      model: summary.model,
      updatedAt: summary.updatedAt,
      stale: this.isStale(summary, conversation),
    };
  }

  /** Maps provider failures onto stable HTTP codes; never leaks internals. */
  private async callModel(request: {
    prompt: string;
    json?: boolean;
    temperature?: number;
  }): Promise<string> {
    try {
      return await this.provider.generate(request);
    } catch (error) {
      if (error instanceof AiProviderError) {
        switch (error.reason) {
          case 'timeout':
            throw new GatewayTimeoutException(error.message);
          case 'quota':
            throw new HttpException(
              error.message,
              HttpStatus.TOO_MANY_REQUESTS,
            );
          case 'malformed':
            throw new BadGatewayException(error.message);
          case 'unavailable':
            throw new ServiceUnavailableException(error.message);
        }
      }
      throw new ServiceUnavailableException('AI is currently unavailable');
    }
  }

  private parseJson<T>(raw: string): T {
    try {
      // Models occasionally wrap JSON in markdown fences despite the mime
      // type — strip them before parsing.
      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '');
      return JSON.parse(cleaned) as T;
    } catch {
      throw new BadGatewayException('The AI returned an unexpected response');
    }
  }
}
