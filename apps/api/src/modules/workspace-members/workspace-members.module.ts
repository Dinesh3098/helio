import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMember } from '../../database/entities';
import { WorkspaceMembersService } from './workspace-members.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceMember])],
  providers: [WorkspaceMembersService],
  exports: [WorkspaceMembersService],
})
export class WorkspaceMembersModule {}
