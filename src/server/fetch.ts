import { Effect, Schema } from "effect"
import { HttpClient } from "effect/http"
import { truncateText } from "./format.js"
import { DeepSeekError, request } from "./http.js"

const FetchRequest = Schema.Struct({ url: Schema.String })
const FetchResponse = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  content: Schema.String,
})

const MAX_FETCH_RESPONSE_BYTES = 5 * 1024 * 1024
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Fetches one validated URL through DeepSeek's extraction API. */
export const fetch = (
  http: HttpClient.HttpClient,
  input: {
    readonly apiKey: string
    readonly baseURL?: string
    readonly url: string
    readonly timeoutMs?: number
    readonly maxRetries?: number
    readonly maxFetchChars?: number
  },
) => {
  const invalid = validateFetchURL(input.url)
  if (invalid) {
    return Effect.fail(new DeepSeekError({ status: 0, message: invalid }))
  }

  const url = normalizeValidatedFetchURL(input.url)
  return request(
    http,
    { ...input, statusErrors: "typed" },
    "/v1/tools/fetch",
    FetchRequest,
    { url },
    FetchResponse,
    MAX_FETCH_RESPONSE_BYTES,
    input.maxRetries ?? 0,
  ).pipe(
    Effect.mapError((error) => {
      if (error instanceof DeepSeekError) {
        return error
      }

      return new DeepSeekError({ status: 0, message: error.message, code: "network_error" })
    }),
    Effect.map((response) => {
      const content = truncateText(response.content, input.maxFetchChars)
      return {
        url,
        title: response.title?.trim() ?? "",
        content,
        contentTruncated:
          input.maxFetchChars !== undefined && [...response.content].length > input.maxFetchChars,
        contentChars: [...content].length,
      }
    }),
  )
}

/** Validates the URL before permission checks and remote fetching. */
export function validateFetchURL(value: string) {
  const trimmed = value.trim()
  if (trimmed.length > 8_192) {
    return "The URL must be at most 8192 characters"
  }

  if (CONTROL_CHARS.test(trimmed)) {
    return "The URL must not contain control characters"
  }

  if (!URL.canParse(trimmed)) {
    return "The URL is not a valid absolute URL"
  }

  const url = new URL(trimmed)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only HTTP and HTTPS URLs are supported"
  }

  if (!url.hostname) {
    return "The URL must include a host"
  }

  if (url.username || url.password) {
    return "The URL must not include a username or password"
  }

  if (url.href.length > 8_192) {
    return "The URL must be at most 8192 characters after normalization"
  }

  return undefined
}

/** Canonicalizes a URL after `validateFetchURL` has established its invariant. */
export function normalizeValidatedFetchURL(value: string) {
  return new URL(value.trim()).href
}
