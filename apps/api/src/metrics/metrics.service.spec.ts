import { Repository } from "typeorm";
import { Conversation, ConversationStatus } from "../database/entities";
import { ConnectionRegistryService } from "../realtime/connection-registry.service";
import { createMockRepository } from "../../test/helpers/unit";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  let conversationsRepository: ReturnType<typeof createMockRepository>;
  let connectionRegistry: ConnectionRegistryService;
  let service: MetricsService;

  // Each instance owns a fresh prom-client Registry, so tests are isolated.
  beforeEach(() => {
    conversationsRepository = createMockRepository();
    conversationsRepository.count.mockResolvedValue(5);
    connectionRegistry = new ConnectionRegistryService();
    service = new MetricsService(
      conversationsRepository as unknown as Repository<Conversation>,
      connectionRegistry,
    );
  });

  const metricValues = async (name: string) => {
    const metric = service.registry.getSingleMetric(name);
    expect(metric).toBeDefined();
    return (await metric!.get()).values;
  };

  it("counts HTTP requests by method/route/status and observes latency", async () => {
    service.recordHttp("GET", "/health", 200, 0.03);
    service.recordHttp("GET", "/health", 200, 0.05);
    service.recordHttp("POST", "/auth/login", 401, 0.2);

    const requests = await metricValues("helio_http_requests_total");
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { method: "GET", route: "/health", status: "200" },
          value: 2,
        }),
        expect.objectContaining({
          labels: { method: "POST", route: "/auth/login", status: "401" },
          value: 1,
        }),
      ]),
    );

    const duration = await metricValues("helio_http_request_duration_seconds");
    const count = duration.find(
      (v) =>
        (v as unknown as { metricName: string }).metricName ===
          "helio_http_request_duration_seconds_count" &&
        v.labels.method === "GET",
    );
    expect(count?.value).toBe(2);
  });

  it("tracks AI and email outcomes on labelled counters", async () => {
    service.recordAi("success");
    service.recordAi("error");
    service.recordAi("error");
    service.recordEmailOutbound("success");
    service.recordEmailInbound();
    service.recordEmailInbound();
    service.recordWidgetSession();

    expect(await metricValues("helio_ai_requests_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labels: { status: "success" }, value: 1 }),
        expect.objectContaining({ labels: { status: "error" }, value: 2 }),
      ]),
    );
    expect(await metricValues("helio_email_outbound_total")).toEqual([
      expect.objectContaining({ labels: { status: "success" }, value: 1 }),
    ]);
    expect((await metricValues("helio_email_inbound_total"))[0]?.value).toBe(2);
    expect((await metricValues("helio_widget_sessions_total"))[0]?.value).toBe(
      1,
    );
  });

  it("records attachment uploads with byte and latency detail per provider", async () => {
    service.recordAttachmentUpload("R2", 1024, 0.4);
    service.recordAttachmentUpload("R2", 2048, 0.6);
    service.recordAttachmentDeleted("R2");
    service.recordAttachmentUploadFailure("LOCAL");

    expect(await metricValues("helio_attachments_uploaded_total")).toEqual([
      expect.objectContaining({ labels: { provider: "R2" }, value: 2 }),
    ]);
    expect(await metricValues("helio_attachment_bytes_uploaded_total")).toEqual(
      [expect.objectContaining({ labels: { provider: "R2" }, value: 3072 })],
    );
    expect(await metricValues("helio_attachments_deleted_total")).toEqual([
      expect.objectContaining({ labels: { provider: "R2" }, value: 1 }),
    ]);
    expect(
      await metricValues("helio_attachment_upload_failures_total"),
    ).toEqual([
      expect.objectContaining({ labels: { provider: "LOCAL" }, value: 1 }),
    ]);

    const duration = await metricValues(
      "helio_attachment_upload_duration_seconds",
    );
    const count = duration.find(
      (v) =>
        (v as unknown as { metricName: string }).metricName ===
        "helio_attachment_upload_duration_seconds_count",
    );
    expect(count?.value).toBe(2);
  });

  it("reads socket gauges live from the ConnectionRegistry at scrape time", async () => {
    connectionRegistry.add("user-1", "sock-a");
    connectionRegistry.add("user-1", "sock-b");
    connectionRegistry.add("user-2", "sock-c");

    expect((await metricValues("helio_websocket_connections"))[0]?.value).toBe(
      3,
    );
    expect(
      (await metricValues("helio_websocket_connected_users"))[0]?.value,
    ).toBe(2);

    connectionRegistry.remove("user-1", "sock-a");
    connectionRegistry.remove("user-1", "sock-b");

    expect((await metricValues("helio_websocket_connections"))[0]?.value).toBe(
      1,
    );
    expect(
      (await metricValues("helio_websocket_connected_users"))[0]?.value,
    ).toBe(1);
  });

  it("pulls the open-conversations gauge from the database on scrape", async () => {
    expect((await metricValues("helio_open_conversations"))[0]?.value).toBe(5);
    expect(conversationsRepository.count).toHaveBeenCalledWith({
      where: { status: ConversationStatus.OPEN },
    });
  });

  it("exposes the whole registry, including default metrics, as text", async () => {
    service.recordAi("success");
    const text = await service.metrics();
    expect(text).toContain("helio_ai_requests_total");
    // collectDefaultMetrics ran with the helio_ prefix on this registry.
    expect(text).toContain("helio_process_cpu_user_seconds_total");
  });
});
