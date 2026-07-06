import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createMockConfig,
  mockFetchAbortOnce,
  mockFetchOnce,
} from "../../../../test/helpers/unit";
import { EmailProviderError, OutboundEmail } from "./provider.interface";
import { ResendProvider } from "./resend.provider";

describe("ResendProvider", () => {
  const makeProvider = (apiKey = "re_test_key") =>
    new ResendProvider(
      createMockConfig({
        "resend.apiKey": apiKey,
      }) as unknown as ConfigService<never, true>,
    );

  const email = (overrides: Partial<OutboundEmail> = {}): OutboundEmail => ({
    from: "support@helio.dev",
    fromName: "Helio Support",
    to: "user@example.com",
    subject: "Re: your ticket",
    text: "Hello there",
    headers: {
      "Message-ID": "<msg-1@helio.dev>",
      "In-Reply-To": "<msg-0@helio.dev>",
    },
    ...overrides,
  });

  const expectFailure = async (
    promise: Promise<unknown>,
    reason: EmailProviderError["reason"],
    retryable: boolean,
  ) => {
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(EmailProviderError);
    expect((error as EmailProviderError).reason).toBe(reason);
    expect((error as EmailProviderError).retryable).toBe(retryable);
    return error as EmailProviderError;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("successful send", () => {
    it("POSTs the message to Resend with the key in the Authorization header", async () => {
      const fetchSpy = mockFetchOnce({ id: "email-1" });

      await expect(makeProvider().send(email())).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        Authorization: "Bearer re_test_key",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(init.body as string)).toEqual({
        from: "Helio Support <support@helio.dev>",
        to: ["user@example.com"],
        subject: "Re: your ticket",
        text: "Hello there",
        headers: {
          "Message-ID": "<msg-1@helio.dev>",
          "In-Reply-To": "<msg-0@helio.dev>",
        },
      });
    });

    it("sends a bare from address when fromName is absent", async () => {
      const fetchSpy = mockFetchOnce({ id: "email-2" });

      await makeProvider().send(email({ fromName: undefined }));

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string).from).toBe("support@helio.dev");
    });
  });

  describe("configuration guard", () => {
    it("throws 'unavailable' without calling fetch when the api key is empty", async () => {
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue({} as Response);

      await expectFailure(makeProvider("").send(email()), "unavailable", true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("failure mapping", () => {
    it("maps an aborted request (timeout) to 'timeout'", async () => {
      mockFetchAbortOnce();
      await expectFailure(makeProvider().send(email()), "timeout", true);
    });

    it("maps a network failure to 'unavailable'", async () => {
      jest
        .spyOn(global, "fetch")
        .mockRejectedValueOnce(new TypeError("fetch failed"));
      await expectFailure(makeProvider().send(email()), "unavailable", true);
    });

    it("maps 429 to retryable 'unavailable' (transient, not a rejection)", async () => {
      mockFetchOnce({ message: "rate limited" }, { status: 429 });
      await expectFailure(makeProvider().send(email()), "unavailable", true);
    });

    it("maps 500 to retryable 'unavailable'", async () => {
      mockFetchOnce({ message: "boom" }, { status: 500 });
      await expectFailure(makeProvider().send(email()), "unavailable", true);
    });

    it("maps a 4xx to non-retryable 'rejected' carrying the provider message", async () => {
      mockFetchOnce({ message: "Domain not verified" }, { status: 422 });
      const error = await expectFailure(
        makeProvider().send(email()),
        "rejected",
        false,
      );
      expect(error.message).toBe("Domain not verified");
    });

    it("falls back to a default message when the error body is malformed", async () => {
      jest.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error("invalid json")),
      } as unknown as Response);
      const error = await expectFailure(
        makeProvider().send(email()),
        "rejected",
        false,
      );
      expect(error.message).toBe("The email provider rejected this message");
    });
  });
});
