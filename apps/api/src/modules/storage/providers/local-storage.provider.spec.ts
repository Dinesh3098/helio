import { ConfigService } from "@nestjs/config";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createMockConfig } from "../../../../test/helpers/unit";
import { StorageProviderError } from "../errors/storage-provider.error";
import { LocalStorageProvider } from "./local-storage.provider";

describe("LocalStorageProvider", () => {
  let rootDir: string;
  let provider: LocalStorageProvider;

  const makeProvider = (dir: string) =>
    new LocalStorageProvider(
      createMockConfig({
        // Absolute path: the constructor resolves against process.cwd(),
        // and resolve() leaves absolute paths untouched.
        "storage.localDir": dir,
      }) as unknown as ConfigService<never, true>,
    );

  beforeEach(() => {
    rootDir = mkdtempSync("/tmp/helio-local-storage-spec-");
    provider = makeProvider(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  const readAll = async (stream: Readable): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  };

  describe("put", () => {
    it("writes the streamed body to the key's path, creating parent dirs", async () => {
      await provider.put({
        key: "ws-1/nested/file.txt",
        body: Readable.from(["hello ", "disk"]),
        contentType: "text/plain",
        contentLength: 10,
      });

      const written = await readFile(
        join(rootDir, "ws-1/nested/file.txt"),
        "utf8",
      );
      expect(written).toBe("hello disk");
    });

    it("rejects a path-traversal key with 'not_found'", async () => {
      await expect(
        provider.put({
          key: "../../etc/passwd",
          body: Readable.from(["x"]),
          contentType: "text/plain",
          contentLength: 1,
        }),
      ).rejects.toMatchObject({
        name: "StorageProviderError",
        reason: "not_found",
      });
      // Rejected before any byte was written: the root stays empty.
      expect(readdirSync(rootDir)).toHaveLength(0);
    });
  });

  describe("getDownload", () => {
    it("streams an existing object back", async () => {
      await writeFile(join(rootDir, "file.txt"), "stored bytes");

      const download = await provider.getDownload("file.txt");

      expect(download.kind).toBe("stream");
      if (download.kind !== "stream") throw new Error("expected stream");
      await expect(readAll(download.stream)).resolves.toBe("stored bytes");
    });

    it("rejects a missing key with 'not_found'", async () => {
      await expect(provider.getDownload("missing.txt")).rejects.toMatchObject({
        name: "StorageProviderError",
        reason: "not_found",
      });
    });

    it("rejects a path-traversal key with 'not_found'", () => {
      // Current behavior: getDownload is not async, so safePath's guard
      // throws synchronously instead of rejecting the returned promise.
      // Callers that `await` inside try/catch see no difference.
      expect(() => provider.getDownload("../../etc/passwd")).toThrow(
        StorageProviderError,
      );
      try {
        void provider.getDownload("../../etc/passwd");
        throw new Error("expected throw");
      } catch (error) {
        expect((error as StorageProviderError).reason).toBe("not_found");
      }
    });
  });

  describe("delete", () => {
    it("removes an existing object", async () => {
      const path = join(rootDir, "gone.txt");
      await writeFile(path, "bye");

      await provider.delete("gone.txt");

      await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("is idempotent when the file is already missing", async () => {
      await expect(
        provider.delete("never-existed.txt"),
      ).resolves.toBeUndefined();
    });

    it("rejects a path-traversal key with 'not_found'", async () => {
      await expect(provider.delete("../../etc/passwd")).rejects.toMatchObject({
        name: "StorageProviderError",
        reason: "not_found",
      });
    });
  });

  describe("checkAvailability", () => {
    it("creates the root directory when it does not exist yet", async () => {
      const freshRoot = join(rootDir, "not-yet-created");
      const freshProvider = makeProvider(freshRoot);
      expect(existsSync(freshRoot)).toBe(false);

      await expect(freshProvider.checkAvailability()).resolves.toBeUndefined();

      expect((await stat(freshRoot)).isDirectory()).toBe(true);
    });
  });
});
