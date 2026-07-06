import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { Contact, Conversation } from '../../database/entities';
import {
  ContactDetailResponseDto,
  ContactResponseDto,
  PaginatedContactsDto,
} from './dto/contact-response.dto';
import { AuditService } from '../audit/audit.service';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly auditService: AuditService,
  ) {}

  async list(
    workspaceId: string,
    query: QueryContactsDto,
  ): Promise<PaginatedContactsDto> {
    // OR across name/email needs the array-of-where form to stay indexable.
    const base = { workspaceId };
    const where = query.search
      ? [
          { ...base, name: ILike(`%${query.search}%`) },
          { ...base, email: ILike(`%${query.search}%`) },
        ]
      : base;

    const [contacts, total] = await this.contactsRepository.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });

    return {
      data: contacts.map((contact) => this.toResponse(contact)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getDetail(
    workspaceId: string,
    contactId: string,
  ): Promise<ContactDetailResponseDto> {
    const contact = await this.findInWorkspace(workspaceId, contactId);

    // One aggregate query over the (workspace_id, contact_id) index instead
    // of three separate counts.
    const stats = await this.conversationsRepository
      .createQueryBuilder('c')
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE c.status = 'OPEN')`, 'open')
      .addSelect(
        'MAX(COALESCE(c.last_message_at, c.created_at))',
        'lastActivity',
      )
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere('c.contact_id = :contactId', { contactId })
      .getRawOne<{ total: string; open: string; lastActivity: Date | null }>();

    return {
      ...this.toResponse(contact),
      totalConversations: parseInt(stats?.total ?? '0', 10),
      openConversations: parseInt(stats?.open ?? '0', 10),
      lastConversationAt: stats?.lastActivity ?? null,
    };
  }

  async update(
    workspaceId: string,
    contactId: string,
    dto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    const contact = await this.findInWorkspace(workspaceId, contactId);

    if (dto.email) {
      const email = dto.email.toLowerCase();
      const duplicate = await this.contactsRepository.findOne({
        where: { workspaceId, email, id: Not(contactId) },
      });
      if (duplicate) {
        throw new ConflictException(
          'Another contact in this workspace already uses this email',
        );
      }
      contact.email = email;
    }
    if (dto.name !== undefined) {
      contact.name = dto.name;
    }
    if (dto.phone !== undefined) {
      contact.phone = dto.phone;
    }

    const saved = await this.contactsRepository.save(contact);
    this.auditService.record({
      workspaceId,
      resourceType: 'contact',
      resourceId: contactId,
      action: 'contact.updated',
      metadata: { fields: Object.keys(dto) },
    });
    return this.toResponse(saved);
  }

  async findInWorkspace(
    workspaceId: string,
    contactId: string,
  ): Promise<Contact> {
    const contact = await this.contactsRepository.findOne({
      where: { id: contactId, workspaceId },
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  private toResponse(contact: Contact): ContactResponseDto {
    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }
}
