import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import { Repository } from "typeorm";
import { Conversation, ConversationStatus } from "../database/entities";
import { ConnectionRegistryService } from "../realtime/connection-registry.service";

/**
 * Prometheus registry for the API. Business services increment through
 * the typed helpers; gauges pull live values in their collect() callbacks
 * at scrape time, so nothing here needs periodic refresh jobs.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequests = new Counter({
    name: "helio_http_requests_total",
    help: "HTTP requests by method, route, and status code",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });

  private readonly httpDuration = new Histogram({
    name: "helio_http_request_duration_seconds",
    help: "HTTP request latency",
    labelNames: ["method", "route"] as const,
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private readonly aiRequests = new Counter({
    name: "helio_ai_requests_total",
    help: "AI provider calls by outcome",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  private readonly emailOutbound = new Counter({
    name: "helio_email_outbound_total",
    help: "Outbound emails handed to the provider, by outcome",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  private readonly emailInbound = new Counter({
    name: "helio_email_inbound_total",
    help: "Inbound emails accepted through the webhook",
    registers: [this.registry],
  });

  private readonly widgetSessions = new Counter({
    name: "helio_widget_sessions_total",
    help: "Chat-widget session bootstraps",
    registers: [this.registry],
  });

  private readonly attachmentsUploaded = new Counter({
    name: "helio_attachments_uploaded_total",
    help: "Attachments stored, by provider",
    labelNames: ["provider"] as const,
    registers: [this.registry],
  });

  private readonly attachmentsDeleted = new Counter({
    name: "helio_attachments_deleted_total",
    help: "Attachments deleted, by provider",
    labelNames: ["provider"] as const,
    registers: [this.registry],
  });

  private readonly attachmentUploadFailures = new Counter({
    name: "helio_attachment_upload_failures_total",
    help: "Failed attachment uploads, by provider",
    labelNames: ["provider"] as const,
    registers: [this.registry],
  });

  private readonly attachmentUploadDuration = new Histogram({
    name: "helio_attachment_upload_duration_seconds",
    help: "Attachment upload latency (validation to stored)",
    labelNames: ["provider"] as const,
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [this.registry],
  });

  private readonly attachmentBytesUploaded = new Counter({
    name: "helio_attachment_bytes_uploaded_total",
    help: "Total bytes stored through attachment uploads",
    labelNames: ["provider"] as const,
    registers: [this.registry],
  });

  constructor(
    @InjectRepository(Conversation)
    conversationsRepository: Repository<Conversation>,
    connectionRegistry: ConnectionRegistryService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: "helio_" });

    new Gauge({
      name: "helio_websocket_connected_users",
      help: "Users with at least one live socket on this instance",
      registers: [this.registry],
      collect() {
        this.set(connectionRegistry.onlineUserIds().length);
      },
    });

    new Gauge({
      name: "helio_websocket_connections",
      help: "Open agent sockets on this instance",
      registers: [this.registry],
      collect() {
        this.set(connectionRegistry.socketCount());
      },
    });

    new Gauge({
      name: "helio_open_conversations",
      help: "Conversations currently OPEN across all workspaces",
      registers: [this.registry],
      async collect() {
        this.set(
          await conversationsRepository.count({
            where: { status: ConversationStatus.OPEN },
          }),
        );
      },
    });
  }

  recordHttp(
    method: string,
    route: string,
    status: number,
    seconds: number,
  ): void {
    this.httpRequests.inc({ method, route, status: String(status) });
    this.httpDuration.observe({ method, route }, seconds);
  }

  recordAi(status: "success" | "error"): void {
    this.aiRequests.inc({ status });
  }

  recordEmailOutbound(status: "success" | "error"): void {
    this.emailOutbound.inc({ status });
  }

  recordEmailInbound(): void {
    this.emailInbound.inc();
  }

  recordWidgetSession(): void {
    this.widgetSessions.inc();
  }

  recordAttachmentUpload(
    provider: string,
    bytes: number,
    seconds: number,
  ): void {
    this.attachmentsUploaded.inc({ provider });
    this.attachmentBytesUploaded.inc({ provider }, bytes);
    this.attachmentUploadDuration.observe({ provider }, seconds);
  }

  recordAttachmentDeleted(provider: string): void {
    this.attachmentsDeleted.inc({ provider });
  }

  recordAttachmentUploadFailure(provider: string): void {
    this.attachmentUploadFailures.inc({ provider });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
