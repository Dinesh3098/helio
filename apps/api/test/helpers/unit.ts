/**
 * Helpers for unit tests (src\/**\/*.spec.ts): everything mocked, no I/O.
 */

/** Jest-mocked subset of a TypeORM repository. Extend per test as needed. */
export const createMockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(async (entity: unknown) => entity),
  create: jest.fn((entity: unknown) => entity),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

export type MockRepository = ReturnType<typeof createMockRepository>;

/**
 * ConfigService stand-in: `get` resolves dotted keys from the given map,
 * mirroring `config.get("storage.maxFileSizeMb", { infer: true })`.
 */
export const createMockConfig = (values: Record<string, unknown>) => ({
  get: jest.fn((key: string) => values[key]),
});

/** One-shot global.fetch mock returning a canned Response. */
export function mockFetchOnce(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): jest.SpyInstance {
  const status = init.status ?? 200;
  return jest.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

/** fetch mock that rejects like an AbortController timeout. */
export function mockFetchAbortOnce(): jest.SpyInstance {
  const abortError = new Error("The operation was aborted");
  abortError.name = "AbortError";
  return jest.spyOn(global, "fetch").mockRejectedValueOnce(abortError);
}
