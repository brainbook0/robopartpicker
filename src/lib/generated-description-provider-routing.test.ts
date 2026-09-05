import { describe, expect, it } from "vitest";
import generatorSource from "../../scripts/generate-project-descriptions.ts?raw";

describe("generated description provider routing", () => {
  it("supports an explicit OpenAI-compatible base URL and key environment variable", () => {
    expect(generatorSource).toContain('valueAfter("--base-url")');
    expect(generatorSource).toContain('valueAfter("--api-key-env")');
    expect(generatorSource).toContain('process.env[apiKeyEnv]');
    expect(generatorSource).toContain('`${providerBaseUrl}/chat/completions`');
  });
});
