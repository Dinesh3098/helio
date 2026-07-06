import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createMockConfig,
  mockFetchAbortOnce,
  mockFetchOnce,
} from "../../../../test/helpers/unit";
import { AiProviderError } from "./ai-provider.interface";
import { GeminiProvider } from "./gemini.provider";

describe("GeminiProvider", () => {
  const makeProvider = (apiKey = "test-key") =>
    new GeminiProvider(
      createMockConfig({
        "gemini.apiKey": apiKey,
      }) as unknown as ConfigService<never, true>,
    );

  const expectReason = async (
    promise: Promise<unknown>,
    reason: AiProviderError["reason"],
  ) => {
    const error = await promise.then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).reason).toBe(reason);
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exposes the pinned model identifier", () => {
    expect(makeProvider().model).toBe("gemini-2.5-flash");
  });

  describe("successful generation", () => {
    it("extracts and joins text from the first candidate's parts", async () => {
      const fetchSpy = mockFetchOnce({
        candidates: [
          {
            content: { parts: [{ text: "Hello " }, { text: "world " }] },
            finishReason: "STOP",
          },
        ],
      });

      await expect(makeProvider().generate({ prompt: "greet" })).resolves.toBe(
        "Hello world",
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-key",
      );
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.contents).toEqual([{ parts: [{ text: "greet" }] }]);
      expect(body.generationConfig).toEqual({ temperature: 0.4 });
    });

    it("requests strict JSON output and forwards the temperature", async () => {
      const fetchSpy = mockFetchOnce({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      });

      await makeProvider().generate({
        prompt: "classify",
        json: true,
        temperature: 0.1,
      });

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.generationConfig).toEqual({
        temperature: 0.1,
        responseMimeType: "application/json",
      });
    });
  });

  describe("configuration guard", () => {
    it("throws 'unavailable' without calling fetch when the api key is empty", async () => {
      const fetchSpy = jest
        .spyOn(global, "fetch")
        .mockResolvedValue({} as Response);

      await expectReason(
        makeProvider("").generate({ prompt: "x" }),
        "unavailable",
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("transport failures", () => {
    it("maps an aborted request (timeout) to 'timeout'", async () => {
      mockFetchAbortOnce();
      await expectReason(makeProvider().generate({ prompt: "x" }), "timeout");
    });

    it("maps a network failure to 'unavailable'", async () => {
      jest
        .spyOn(global, "fetch")
        .mockRejectedValueOnce(new TypeError("fetch failed"));
      await expectReason(
        makeProvider().generate({ prompt: "x" }),
        "unavailable",
      );
    });
  });

  describe("HTTP error mapping", () => {
    it("maps 429 to 'quota'", async () => {
      mockFetchOnce({}, { status: 429 });
      await expectReason(makeProvider().generate({ prompt: "x" }), "quota");
    });

    it("maps 500 to 'unavailable'", async () => {
      mockFetchOnce({}, { status: 500 });
      await expectReason(
        makeProvider().generate({ prompt: "x" }),
        "unavailable",
      );
    });
  });

  describe("malformed responses", () => {
    it("maps a body without candidates to 'malformed'", async () => {
      mockFetchOnce({});
      await expectReason(makeProvider().generate({ prompt: "x" }), "malformed");
    });

    it("maps empty parts to 'malformed'", async () => {
      mockFetchOnce({ candidates: [{ content: { parts: [] } }] });
      await expectReason(makeProvider().generate({ prompt: "x" }), "malformed");
    });

    it("maps a safety-blocked candidate (finishReason SAFETY, no text) to 'malformed'", async () => {
      mockFetchOnce({ candidates: [{ finishReason: "SAFETY" }] });
      await expectReason(makeProvider().generate({ prompt: "x" }), "malformed");
    });

    it("maps whitespace-only text to 'malformed'", async () => {
      mockFetchOnce({
        candidates: [{ content: { parts: [{ text: "   " }] } }],
      });
      await expectReason(makeProvider().generate({ prompt: "x" }), "malformed");
    });

    it("maps an unparseable JSON body to 'malformed'", async () => {
      jest.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("invalid json")),
      } as unknown as Response);
      await expectReason(makeProvider().generate({ prompt: "x" }), "malformed");
    });
  });
});
