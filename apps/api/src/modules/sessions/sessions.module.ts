import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserSession } from "../../database/entities";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [TypeOrmModule.forFeature([UserSession])],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
