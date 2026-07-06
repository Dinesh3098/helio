import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Readable } from "node:stream";
import { createMockConfig } from "../../../test/helpers/unit";
import { StorageProviderError } from "./errors/storage-provider.error";
import { StorageProvider } from "./providers/storage-provider.interface";
import { StorageService } from "./storage.service";

describe("StorageService", () => {
  let provider: jest.Mocked<StorageProvider>;
  let service: StorageService;

  beforeEach(() => {
    provider = {
      name: "MOCK",
      put: jest.fn().mockResolvedValue(undefined),
      getDownload: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      checkAvailability: jest.fn().mockResolvedValue(undefined),
    };
    service = new StorageService(
      provider,
      createMockConfig({
        "storage.maxFileSizeMb": 10,
      }) as unknown as ConfigService<never, true>,
    );
  });

  describe("validate", () => {
    it("accepts an allowed mime type within the size limit", () => {
      expect(() =>
        service.validate("photo.png", "image/png", 1024),
      ).not.toThrow();
    });

    it("rejects files over the configured limit", () => {
      expect(() =>
        service.validate("big.pdf", "application/pdf", 11 * 1024 * 1024),
      ).toThrow(PayloadTooLargeException);
    });

    it("rejects empty files", () => {
      expect(() => service.validate("empty.png", "image/png", 0)).toThrow(
        BadRequestException,
      );
    });

    it("rejects unsupported mime types", () => {
      expect(() =>
        service.validate("app.exe", "application/x-msdownload", 10),
      ).toThrow(UnsupportedMediaTypeException);
    });

    it("rejects forbidden extensions even with an allowed mime type", () => {
      expect(() => service.validate("evil.svg", "image/png", 10)).toThrow(
        UnsupportedMediaTypeException,
      );
    });
  });

  describe("sanitizeFilename", () => {
    it("strips unsafe characters and keeps a mime-derived extension", () => {
      expect(service.sanitizeFilename('we/ird"name.png', "image/png")).toBe(
        "weirdname.png",
      );
    });

    it("falls back to 'file' when nothing survives", () => {
      expect(service.sanitizeFilename("<<<>>>.pdf", "application/pdf")).toBe(
        "file.pdf",
      );
    });
  });

  describe("store", () => {
    const input = () => ({
      workspaceId: "ws-1",
      body: Readable.from(["data"]),
      originalFilename: "report.pdf",
      mimeType: "application/pdf",
      size: 4,
    });

    it("delegates to the provider with an opaque workspace-scoped key", async () => {
      const stored = await service.store(input());
      expect(provider.put).toHaveBeenCalledTimes(1);
      const key = provider.put.mock.calls[0]![0].key;
      expect(key.startsWith("ws-1/")).toBe(true);
      expect(key.endsWith(".pdf")).toBe(true);
      expect(stored.provider).toBe("MOCK");
      expect(stored.originalFilename).toBe("report.pdf");
    });

    it("maps provider unavailability to 503", async () => {
      provider.put.mockRejectedValueOnce(
        new StorageProviderError("unavailable", "down"),
      );
      await expect(service.store(input())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe("getDownload / delete error mapping", () => {
    it("maps not_found to 404", async () => {
      provider.getDownload.mockRejectedValueOnce(
        new StorageProviderError("not_found", "missing"),
      );
      await expect(service.getDownload("k", "f.pdf")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("maps unknown errors to 503", async () => {
      provider.delete.mockRejectedValueOnce(new Error("boom"));
      await expect(service.delete("k")).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe("healthCheck", () => {
    it("reports available when the provider responds", async () => {
      await expect(service.healthCheck()).resolves.toEqual({ available: true });
    });

    it("never throws — an unavailable backend degrades instead", async () => {
      provider.checkAvailability.mockRejectedValueOnce(
        new StorageProviderError("unavailable", "no bucket"),
      );
      await expect(service.healthCheck()).resolves.toMatchObject({
        available: false,
      });
    });
  });
});
