import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PaginatedConversationsDto,
} from '../conversations/dto/conversation-response.dto';
import { QueryConversationsDto } from '../conversations/dto/query-conversations.dto';
import { ConversationsService } from '../conversations/conversations.service';
import { ContactsService } from './contacts.service';
import {
  ContactDetailResponseDto,
  ContactResponseDto,
  PaginatedContactsDto,
} from './dto/contact-response.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

const ALL_ROLES = [
  WorkspaceMemberRole.OWNER,
  WorkspaceMemberRole.ADMIN,
  WorkspaceMemberRole.AGENT,
] as const;

@ApiTags('contacts')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  required: false,
  description:
    'Workspace to operate on. Optional when the user belongs to exactly one workspace.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'List contacts (search, paginated)' })
  @ApiOkResponse({ type: PaginatedContactsDto })
  list(
    @CurrentMembership() membership: WorkspaceMember,
    @Query() query: QueryContactsDto,
  ): Promise<PaginatedContactsDto> {
    return this.contactsService.list(membership.workspaceId, query);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Contact profile with conversation stats' })
  @ApiOkResponse({ type: ContactDetailResponseDto })
  getDetail(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContactDetailResponseDto> {
    return this.contactsService.getDetail(membership.workspaceId, id);
  }

  @Patch(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Update contact profile' })
  @ApiOkResponse({ type: ContactResponseDto })
  update(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    return this.contactsService.update(membership.workspaceId, id, dto);
  }

  @Get(':id/conversations')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: "Contact's conversations by latest activity" })
  @ApiOkResponse({ type: PaginatedConversationsDto })
  async listConversations(
    @CurrentMembership() membership: WorkspaceMember,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryConversationsDto,
  ): Promise<PaginatedConversationsDto> {
    // 404 for unknown/foreign contact before listing.
    await this.contactsService.findInWorkspace(membership.workspaceId, id);
    return this.conversationsService.listForContact(
      membership.workspaceId,
      id,
      query,
    );
  }
}
