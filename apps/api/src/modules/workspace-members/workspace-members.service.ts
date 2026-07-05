import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceMemberRole } from '../../database/entities';
import { UsersService } from '../users/users.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { MemberResponseDto } from './dto/member-response.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class WorkspaceMembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly membersRepository: Repository<WorkspaceMember>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * RBAC source of truth — roles live here, never in the JWT, so a role
   * change or removal takes effect on the next request.
   */
  async findMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    return this.membersRepository.findOne({ where: { workspaceId, userId } });
  }

  /**
   * Used by RolesGuard to resolve the implicit workspace when no
   * x-workspace-id header is sent. take: 2 — only "exactly one?" matters.
   */
  async findByUser(userId: string): Promise<WorkspaceMember[]> {
    return this.membersRepository.find({ where: { userId }, take: 2 });
  }

  async listMembers(workspaceId: string): Promise<MemberResponseDto[]> {
    const members = await this.membersRepository.find({
      where: { workspaceId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return members.map((member) => this.toResponse(member));
  }

  async invite(
    actor: WorkspaceMember,
    dto: InviteMemberDto,
  ): Promise<MemberResponseDto> {
    if (
      dto.role === WorkspaceMemberRole.ADMIN &&
      actor.role !== WorkspaceMemberRole.OWNER
    ) {
      throw new ForbiddenException('Only the owner can invite admins');
    }

    const user = await this.usersService.findByEmail(dto.email.toLowerCase());
    if (!user) {
      throw new NotFoundException('No user exists with this email');
    }

    const existing = await this.findMembership(actor.workspaceId, user.id);
    if (existing) {
      throw new ConflictException('User is already a member of this workspace');
    }

    const member = await this.membersRepository.save(
      this.membersRepository.create({
        workspaceId: actor.workspaceId,
        userId: user.id,
        role: dto.role,
      }),
    );

    member.user = user;
    return this.toResponse(member);
  }

  async updateRole(
    actor: WorkspaceMember,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MemberResponseDto> {
    const target = await this.findInWorkspace(actor.workspaceId, memberId);

    if (target.role === WorkspaceMemberRole.OWNER) {
      throw new ForbiddenException('The owner role cannot be changed');
    }
    if (target.userId === actor.userId) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if (actor.role === WorkspaceMemberRole.ADMIN) {
      if (target.role !== WorkspaceMemberRole.AGENT) {
        throw new ForbiddenException('Admins can only manage agents');
      }
      if (dto.role === WorkspaceMemberRole.ADMIN) {
        throw new ForbiddenException('Only the owner can promote to admin');
      }
    }

    if (target.role !== dto.role) {
      target.role = dto.role;
      await this.membersRepository.save(target);
    }
    return this.toResponse(target);
  }

  async remove(actor: WorkspaceMember, memberId: string): Promise<void> {
    const target = await this.findInWorkspace(actor.workspaceId, memberId);

    if (target.role === WorkspaceMemberRole.OWNER) {
      throw new ForbiddenException('The owner cannot be removed');
    }
    if (target.userId === actor.userId) {
      throw new ForbiddenException('You cannot remove yourself');
    }
    if (
      actor.role === WorkspaceMemberRole.ADMIN &&
      target.role !== WorkspaceMemberRole.AGENT
    ) {
      throw new ForbiddenException('Admins can only remove agents');
    }

    await this.membersRepository.remove(target);
  }

  /**
   * Lookup always scoped to the actor's workspace — a memberId from another
   * tenant is indistinguishable from a nonexistent one (404).
   */
  private async findInWorkspace(
    workspaceId: string,
    memberId: string,
  ): Promise<WorkspaceMember> {
    const member = await this.membersRepository.findOne({
      where: { id: memberId, workspaceId },
      relations: { user: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found in this workspace');
    }
    return member;
  }

  private toResponse(member: WorkspaceMember): MemberResponseDto {
    return {
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.createdAt,
    };
  }
}
