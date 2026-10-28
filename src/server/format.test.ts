import { describe, expect, test } from "bun:test"
import {
  formatFetchResult,
  formatSearchResults,
  truncateText,
  UNTRUSTED_WEB_CONTENT,
} from "./format.js"

describe("format", () => {
  test("truncates by Unicode code point", () => {
    const output = truncateText("🚀".repeat(30), 20)
    expect([...output].length).toBeLessThanOrEqual(20)
    expect(output).toContain("[truncated]")
  })

  test("marks search output as untrusted and caps total output", () => {
    const output = formatSearchResults(
      "q",
      [{ title: "T", url: "https://example.com", summary: "x".repeat(100) }],
      { maxOutputChars: 80, contentRequested: false },
    )
    expect(output).toContain(UNTRUSTED_WEB_CONTENT.slice(0, 20))
    expect(output).toContain("[truncated]")
  })

  test("includes source and untrusted-content guidance for fetch output", () => {
    const output = formatFetchResult("Example", "https://example.com", "content")
    expect(output).toContain("Source: https://example.com")
    expect(output).toContain(UNTRUSTED_WEB_CONTENT)
  })
})
