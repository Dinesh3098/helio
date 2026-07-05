import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  HelpArticle,
  HelpCategory,
  Workspace,
} from '../../database/entities';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { KbArticlesService } from './kb-articles.service';
import { KbCategoriesService } from './kb-categories.service';
import { KbController } from './kb.controller';
import { PublicHelpController } from './public-help.controller';
import { PublicHelpService } from './public-help.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HelpCategory, HelpArticle, Workspace]),
    // RolesGuard resolves the caller's membership through this module.
    WorkspaceMembersModule,
  ],
  controllers: [KbController, PublicHelpController],
  providers: [KbCategoriesService, KbArticlesService, PublicHelpService],
})
export class KbModule {}
