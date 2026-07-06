import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SystemServiceDto {
  @ApiProperty({ example: "PostgreSQL" })
  name: string;

  @ApiProperty({
    example: "up",
    enum: ["up", "down", "configured", "unconfigured"],
  })
  status: string;

  @ApiPropertyOptional({ example: 12 })
  latencyMs?: number;
}

export class SystemStatusDto {
  @ApiProperty({ type: SystemServiceDto, isArray: true })
  services: SystemServiceDto[];

  @ApiProperty()
  sockets: { connections: number; users: number };

  @ApiProperty({ example: 86400 })
  uptimeSeconds: number;

  @ApiProperty()
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };

  @ApiProperty({ example: "0.1.0" })
  version: string;

  @ApiProperty({ example: "development" })
  environment: string;

  @ApiProperty({ example: "v22.20.0" })
  node: string;
}
