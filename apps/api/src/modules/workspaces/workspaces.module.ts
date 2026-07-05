import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../../database/entities';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  // WorkspaceMembersModule provides the service RolesGuard depends on.
  imports: [TypeOrmModule.forFeature([Workspace]), WorkspaceMembersModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
