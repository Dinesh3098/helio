import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspacesRepository: Repository<Workspace>,
    private readonly auditService: AuditService,
  ) {}

  async getById(workspaceId: string): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return this.toResponse(workspace);
  }

  async updateName(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const previousName = workspace.name;
    workspace.name = dto.name;
    if (previousName !== dto.name) {
      this.auditService.record({
        workspaceId,
        resourceType: 'workspace',
        resourceId: workspaceId,
        action: 'workspace.updated',
        metadata: { from: previousName, to: dto.name },
      });
    }
    const saved = await this.workspacesRepository.save(workspace);
    return this.toResponse(saved);
  }

  private toResponse(workspace: Workspace): WorkspaceResponseDto {
    return {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }
}
