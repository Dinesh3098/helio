/**
 * Two projects:
 *  - unit:        src\/**\/*.spec.ts        — mocked dependencies, no I/O
 *  - integration: test\/**\/*.int-spec.ts   — real Postgres + Redis
 *                  (containers managed by test/setup/global-setup.cjs)
 */
const transform = {
  "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/**/*.spec.ts"],
      transform,
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["<rootDir>/test/**/*.int-spec.ts"],
      transform,
      globalSetup: "<rootDir>/test/setup/global-setup.cjs",
      globalTeardown: "<rootDir>/test/setup/global-teardown.cjs",
    },
  ],
  // Integration files boot a full Nest app against a real database.
  testTimeout: 30000,
  maxWorkers: 3,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/main.ts",
    "!src/database/migrations/**",
    "!src/database/data-source.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov", "json-summary"],
};
