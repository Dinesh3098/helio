import { Global, Module } from "@nestjs/common";
import { RequestContextService } from "./request-context.service";

/** Global: correlation data is read by logging, auditing, and metrics. */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
