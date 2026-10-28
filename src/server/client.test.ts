import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { normalizeValidatedFetchURL, validateFetchURL } from "./fetch.js"
import { search, searchProvider } from "./search.js"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("fetch URL validation", () => {
  test("normalizes a validated URL", () => {
    expect(normalizeValidatedFetchURL(" https://example.com/a b ")).toBe(
      "https://example.com/a%20b",
    )
  })

  test("rejects credentials and control characters", () => {
    expect(validateFetchURL("https://user:pass@example.com")).toContain("username")
    expect(validateFetchURL("https://example.com/a\nfake")).toContain("control")
  })

  test("retries typed and provider failures when configured", async () => {
    let attempts = 0
    let mode: "typed" | "provider" = "typed"
    globalThis.fetch = (async () => {
      attempts += 1
      const failure = mode === "typed" ? 429 : 503
      return attempts === 1
        ? new Response(JSON.stringify({ error: { message: "temporary" } }), {
            status: failure,
            headers: { "content-type": "application/json", "retry-after": "0" },
          })
        : new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
    }) as unknown as typeof fetch
    const http = await Effect.runPromise(
      HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer)),
    )
    const results = await Effect.runPromise(
      search(http, { apiKey: "test-key", query: "q", maxRetries: 1 }),
    )
    expect(results).toEqual([])
    expect(attempts).toBe(2)
    mode = "provider"
    attempts = 0
    const providerResults = await Effect.runPromise(
      searchProvider(http, { apiKey: "test-key", query: "q", maxRetries: 1 }),
    )
    expect(providerResults).toEqual([])
    expect(attempts).toBe(2)
  })
})
