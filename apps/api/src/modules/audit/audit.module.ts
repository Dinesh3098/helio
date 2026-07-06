import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../database/entities';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Global: nearly every business module records audit events; a global
 * provider keeps that to one constructor line per service instead of an
 * import per module.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    // RolesGuard on AuditController resolves memberships through this.
    WorkspaceMembersModule,
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
