import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember } from '../../database/entities';

@Injectable()
export class WorkspaceMembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly membersRepository: Repository<WorkspaceMember>,
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
}
