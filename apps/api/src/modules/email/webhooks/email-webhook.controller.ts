import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  InboundEmailDto,
  InboundEmailResultDto,
} from "../dto/inbound-email.dto";
import { EmailService } from "../email.service";

/**
 * Inbound-email entry point, shaped like a provider webhook. Public by
 * design (mail providers can't log in): the receiving mailbox routes the
 * message, and only addresses connected as EmailAccounts are accepted. A
 * production deployment would additionally verify the provider's webhook
 * signature (e.g. Svix headers for Resend) before parsing.
 */
@ApiTags("email")
@Controller("email")
export class EmailWebhookController {
  constructor(private readonly emailService: EmailService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive an inbound email (simulated webhook)" })
  @ApiOkResponse({ type: InboundEmailResultDto })
  receive(@Body() dto: InboundEmailDto): Promise<InboundEmailResultDto> {
    return this.emailService.receiveInbound(dto);
  }
}
