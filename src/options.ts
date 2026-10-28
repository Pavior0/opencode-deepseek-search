import { Schema } from "effect"

const DEFAULT_ENV = "DEEPSEEK_API_KEY"
const DEFAULT_COUNT = 8
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 120_000
const DEFAULT_MAX_RETRIES = 2
const MAX_RETRIES = 5
const DEFAULT_MAX_CONTENT_CHARS = 20_000
const DEFAULT_MAX_SUMMARY_CHARS = 4_000
const DEFAULT_MAX_FETCH_CHARS = 50_000
const DEFAULT_MAX_OUTPUT_CHARS = 120_000

export const Options = Schema.Struct({
  apiKey: Schema.optionalKey(Schema.String),
  baseURL: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Array(Schema.String)),
  count: Schema.optionalKey(Schema.Number),
  needContent: Schema.optionalKey(Schema.Boolean),
  localization: Schema.optionalKey(Schema.String),
  timeoutMs: Schema.optionalKey(Schema.Number),
  maxRetries: Schema.optionalKey(Schema.Number),
  maxContentChars: Schema.optionalKey(Schema.Number),
  maxSummaryChars: Schema.optionalKey(Schema.Number),
  maxFetchChars: Schema.optionalKey(Schema.Number),
  maxOutputChars: Schema.optionalKey(Schema.Number),
  defaultProvider: Schema.optionalKey(Schema.Boolean),
  fetchTool: Schema.optionalKey(Schema.Boolean),
})
export type Options = typeof Options.Type

export interface ResolvedOptions {
  readonly apiKey?: string
  readonly baseURL: string
  readonly env: readonly string[]
  readonly count: number
  readonly needContent: boolean
  readonly localization?: string
  readonly timeoutMs: number
  readonly maxRetries: number
  readonly maxContentChars: number
  readonly maxSummaryChars: number
  readonly maxFetchChars: number
  readonly maxOutputChars: number
  readonly defaultProvider: boolean
  readonly fetchTool: boolean
}

/** Decodes plugin options and rejects unsafe endpoints before any request can use them. */
export function resolveOptions(input: unknown): ResolvedOptions {
  const value = Schema.decodeUnknownSync(Options)(input)
  return {
    apiKey: nonEmpty(value.apiKey),
    baseURL: normalizeBaseURL(value.baseURL),
    env: Array.from(
      new Set([DEFAULT_ENV, ...(value.env ?? [])].map((name) => name.trim()).filter(Boolean)),
    ),
    count: clamp(value.count ?? DEFAULT_COUNT, 1, 50),
    needContent: value.needContent ?? false,
    localization: nonEmpty(value.localization),
    timeoutMs: clamp(value.timeoutMs ?? DEFAULT_TIMEOUT, 1_000, MAX_TIMEOUT),
    maxRetries: clamp(value.maxRetries ?? DEFAULT_MAX_RETRIES, 0, MAX_RETRIES),
    maxContentChars: clamp(value.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS, 1_000, 200_000),
    maxSummaryChars: clamp(value.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS, 100, 50_000),
    maxFetchChars: clamp(value.maxFetchChars ?? DEFAULT_MAX_FETCH_CHARS, 1_000, 1_000_000),
    maxOutputChars: clamp(value.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS, 1_000, 1_000_000),
    defaultProvider: value.defaultProvider ?? false,
    fetchTool: value.fetchTool ?? true,
  }
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeBaseURL(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return "https://api.deepseek.com"
  }
  if (!URL.canParse(trimmed))
    throw new Error("The plugin option baseURL is invalid: must be an absolute URL")
  const url = new URL(trimmed)
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"])
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback.has(url.hostname)))
    throw new Error(
      "The plugin option baseURL is invalid: must use https (http is allowed only for loopback hosts)",
    )
  if (url.username || url.password)
    throw new Error("The plugin option baseURL is invalid: must not include credentials")
  if (!url.hostname) {
    throw new Error("The plugin option baseURL is invalid: must include a host")
  }
  if (url.search || url.hash)
    throw new Error("The plugin option baseURL is invalid: must not include a query or hash")
  return url.toString().replace(/\/+$/, "")
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}
