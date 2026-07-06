import { Module } from "@nestjs/common";
import { RealtimeEmitterModule } from "../../realtime/realtime-emitter.module";
import { WorkspaceMembersModule } from "../workspace-members/workspace-members.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [WorkspaceMembersModule, RealtimeEmitterModule],
  controllers: [AdminController],
})
export class AdminModule {}
