import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { MetricsService } from "./metrics.service";

/**
 * Prometheus scrape target. Unauthenticated by convention (scrapers don't
 * hold JWTs); in production restrict it at the network layer or behind
 * the scraper's bearer token.
 */
@ApiTags("observability")
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @ApiOperation({ summary: "Prometheus metrics" })
  metrics(): Promise<string> {
    return this.metricsService.metrics();
  }
}
