import { describe, expect, test } from "bun:test"
import { resolveOptions } from "./options.js"

describe("resolveOptions", () => {
  test("keeps the default environment variable alongside custom names", () => {
    expect(resolveOptions({ env: [" CUSTOM_KEY ", "DEEPSEEK_API_KEY"] }).env).toEqual([
      "DEEPSEEK_API_KEY",
      "CUSTOM_KEY",
    ])
  })

  test("clamps retry and output limits", () => {
    expect(resolveOptions({ maxRetries: 99, maxFetchChars: 999_999_999 })).toMatchObject({
      maxRetries: 5,
      maxFetchChars: 1_000_000,
    })
  })

  test("only permits insecure loopback base URLs", () => {
    expect(resolveOptions({ baseURL: "http://127.0.0.1:8080/v1/" }).baseURL).toBe(
      "http://127.0.0.1:8080/v1",
    )
    expect(() => resolveOptions({ baseURL: "http://example.com" })).toThrow(/https/)
    expect(() => resolveOptions({ baseURL: "https://example.com?token=1" })).toThrow(/query/)
  })
})
