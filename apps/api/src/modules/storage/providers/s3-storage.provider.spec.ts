import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Readable } from "node:stream";
import { createMockConfig } from "../../../../test/helpers/unit";
import { StorageProviderError } from "../errors/storage-provider.error";
import { S3StorageProvider } from "./s3-storage.provider";

jest.mock("@aws-sdk/client-s3", () => {
  class MockS3ServiceException extends Error {
    constructor(options: { name?: string; message?: string }) {
      super(options?.message ?? "s3 error");
      this.name = options?.name ?? "S3ServiceException";
    }
  }
  return {
    S3Client: jest.fn(),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    S3ServiceException: MockS3ServiceException,
  };
});

jest.mock("@aws-sdk/lib-storage", () => ({ Upload: jest.fn() }));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

const S3ClientMock = S3Client as unknown as jest.Mock;
const UploadMock = Upload as unknown as jest.Mock;
const PutObjectCommandMock = PutObjectCommand as unknown as jest.Mock;
const GetObjectCommandMock = GetObjectCommand as unknown as jest.Mock;
const DeleteObjectCommandMock = DeleteObjectCommand as unknown as jest.Mock;
const getSignedUrlMock = getSignedUrl as unknown as jest.Mock;

describe("S3StorageProvider", () => {
  const sendMock = jest.fn();
  const uploadDoneMock = jest.fn();

  const makeProvider = (
    aws: Partial<Record<string, string>> = {},
  ): S3StorageProvider =>
    new S3StorageProvider(
      createMockConfig({
        "storage.aws": {
          bucket: "test-bucket",
          region: "us-east-1",
          accessKeyId: "AKIA_TEST",
          secretAccessKey: "secret",
          ...aws,
        },
      }) as unknown as ConfigService<never, true>,
    );

  const s3Error = (name: string): S3ServiceException => {
    // The mocked class only needs a name — mapError switches on it.
    return new S3ServiceException({
      name,
      message: `${name} happened`,
    } as never);
  };

  const expectReason = async (
    promise: Promise<unknown>,
    reason: StorageProviderError["reason"],
  ) => {
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StorageProviderError);
    expect((error as StorageProviderError).reason).toBe(reason);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    S3ClientMock.mockImplementation(() => ({ send: sendMock }));
    UploadMock.mockImplementation(() => ({ done: uploadDoneMock }));
    sendMock.mockResolvedValue({});
    uploadDoneMock.mockResolvedValue({});
    getSignedUrlMock.mockResolvedValue("https://signed.example.com/object");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("unconfigured (empty region/bucket)", () => {
    it("constructs without touching the SDK", () => {
      makeProvider({ region: "", bucket: "" });
      expect(S3ClientMock).not.toHaveBeenCalled();
    });

    it("fails lazily with 'unavailable' when an operation is attempted", async () => {
      const provider = makeProvider({ region: "", bucket: "" });
      await expectReason(
        provider.put({
          key: "k",
          body: Readable.from(["x"]),
          contentType: "text/plain",
          contentLength: 1,
        }),
        "unavailable",
      );
      await expectReason(provider.getDownload("k", "f.txt"), "unavailable");
      await expectReason(provider.delete("k"), "unavailable");
      await expectReason(provider.checkAvailability(), "unavailable");
      expect(S3ClientMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe("put", () => {
    it("streams the upload through lib-storage with bucket, key, and metadata", async () => {
      const body = Readable.from(["data"]);
      await makeProvider().put({
        key: "ws-1/file.pdf",
        body,
        contentType: "application/pdf",
        contentLength: 4,
      });

      expect(S3ClientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          region: "us-east-1",
          credentials: {
            accessKeyId: "AKIA_TEST",
            secretAccessKey: "secret",
          },
        }),
      );
      expect(UploadMock).toHaveBeenCalledWith({
        client: expect.anything(),
        params: {
          Bucket: "test-bucket",
          Key: "ws-1/file.pdf",
          Body: body,
          ContentType: "application/pdf",
          ContentLength: 4,
        },
      });
      expect(uploadDoneMock).toHaveBeenCalledTimes(1);
    });

    it("maps an upload failure through the error taxonomy", async () => {
      uploadDoneMock.mockRejectedValueOnce(s3Error("AccessDenied"));
      await expectReason(
        makeProvider().put({
          key: "k",
          body: Readable.from(["x"]),
          contentType: "text/plain",
          contentLength: 1,
        }),
        "permission",
      );
    });
  });

  describe("getDownload", () => {
    it("returns a signed url with an attachment content-disposition", async () => {
      const download = await makeProvider().getDownload(
        "ws-1/file.pdf",
        "report.pdf",
      );

      expect(download).toEqual({
        kind: "url",
        url: "https://signed.example.com/object",
      });
      expect(GetObjectCommandMock).toHaveBeenCalledWith({
        Bucket: "test-bucket",
        Key: "ws-1/file.pdf",
        ResponseContentDisposition: 'attachment; filename="report.pdf"',
      });
      expect(getSignedUrlMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });

    it("maps signing failures", async () => {
      getSignedUrlMock.mockRejectedValueOnce(s3Error("NoSuchKey"));
      await expectReason(makeProvider().getDownload("k", "f.pdf"), "not_found");
    });
  });

  describe("delete", () => {
    it("sends a DeleteObjectCommand for the key", async () => {
      await makeProvider().delete("ws-1/file.pdf");

      expect(DeleteObjectCommandMock).toHaveBeenCalledWith({
        Bucket: "test-bucket",
        Key: "ws-1/file.pdf",
      });
      expect(sendMock).toHaveBeenCalledWith(
        DeleteObjectCommandMock.mock.instances[0],
      );
    });
  });

  describe("checkAvailability", () => {
    it("probes with a PutObject to the sentinel key", async () => {
      await makeProvider().checkAvailability();

      expect(PutObjectCommandMock).toHaveBeenCalledWith({
        Bucket: "test-bucket",
        Key: ".health/probe",
        Body: "ok",
        ContentType: "text/plain",
      });
      expect(sendMock).toHaveBeenCalledWith(
        PutObjectCommandMock.mock.instances[0],
      );
    });

    it("surfaces a missing bucket as 'unavailable'", async () => {
      sendMock.mockRejectedValueOnce(s3Error("NoSuchBucket"));
      await expectReason(makeProvider().checkAvailability(), "unavailable");
    });
  });

  describe("error mapping", () => {
    it.each([
      ["NoSuchKey", "not_found"],
      ["NotFound", "not_found"],
      ["AccessDenied", "permission"],
      ["InvalidAccessKeyId", "permission"],
      ["SignatureDoesNotMatch", "permission"],
      ["ExpiredToken", "permission"],
      ["NoSuchBucket", "unavailable"],
      ["SlowDown", "unavailable"],
    ] as const)("maps S3 %s to '%s'", async (awsName, reason) => {
      sendMock.mockRejectedValueOnce(s3Error(awsName));
      await expectReason(makeProvider().delete("k"), reason);
    });

    it("maps a TimeoutError to 'timeout'", async () => {
      const timeout = new Error("socket hang up");
      timeout.name = "TimeoutError";
      sendMock.mockRejectedValueOnce(timeout);
      await expectReason(makeProvider().delete("k"), "timeout");
    });

    it("maps an AbortError to 'timeout'", async () => {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      sendMock.mockRejectedValueOnce(abort);
      await expectReason(makeProvider().delete("k"), "timeout");
    });

    it("maps a plain error mentioning timeout to 'timeout'", async () => {
      sendMock.mockRejectedValueOnce(new Error("request timeout reached"));
      await expectReason(makeProvider().delete("k"), "timeout");
    });

    it("maps unknown errors to 'unavailable'", async () => {
      sendMock.mockRejectedValueOnce(new Error("mystery"));
      await expectReason(makeProvider().delete("k"), "unavailable");
    });
  });
});
