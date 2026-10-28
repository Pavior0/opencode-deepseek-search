import { isIP } from "node:net"
import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientError } from "effect/http"
import type { SearchInput, SearchResult } from "../rpc.js"
import { truncateText } from "./format.js"
import { DeepSeekError, request } from "./http.js"

const SearchRequest = Schema.Struct({
  query: Schema.String,
  count: Schema.optionalKey(Schema.Number),
  ori_question: Schema.optionalKey(Schema.String),
  localization: Schema.optionalKey(Schema.String),
  need_content: Schema.optionalKey(Schema.Boolean),
})

const RawSearchResult = Schema.Struct({
  rerank_score: Schema.optionalKey(Schema.Number),
  title: Schema.optionalKey(Schema.String),
  url: Schema.String,
  snippet: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  content: Schema.optionalKey(Schema.String),
  site_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  site_icon: Schema.optionalKey(Schema.NullOr(Schema.String)),
  date: Schema.optionalKey(Schema.NullOr(Schema.String)),
  authority: Schema.optionalKey(Schema.Number),
})

const SearchResponse = Schema.Struct({
  results: Schema.Array(Schema.Unknown),
})

const MAX_SEARCH_RESPONSE_BYTES = 256 * 1024
const MAX_SEARCH_RESPONSE_BYTES_LIMIT = 16 * 1024 * 1024

export type ClientSearchInput = SearchInput & {
  readonly apiKey: string
  readonly baseURL?: string
  readonly timeoutMs?: number
  readonly maxRetries?: number
  readonly maxContentChars?: number
  readonly maxSummaryChars?: number
}

/** Runs a typed DeepSeek search request with retry and output-boundary handling. */
export const search = (
  http: HttpClient.HttpClient,
  input: ClientSearchInput,
): Effect.Effect<readonly SearchResult[], DeepSeekError> =>
  searchRequest(http, input, "typed").pipe(Effect.mapError(asDeepSeekError))

/** Runs a provider request while preserving HTTP errors for OpenCode fallback logic. */
export const searchProvider = (
  http: HttpClient.HttpClient,
  input: ClientSearchInput,
): Effect.Effect<readonly SearchResult[], DeepSeekError | HttpClientError.HttpClientError> =>
  searchRequest(http, input, "http")

const searchRequest = (
  http: HttpClient.HttpClient,
  input: ClientSearchInput,
  statusErrors: "typed" | "http",
): Effect.Effect<readonly SearchResult[], DeepSeekError | HttpClientError.HttpClientError> => {
  const query = input.query.trim()
  if (!query) {
    return Effect.fail(new DeepSeekError({ status: 0, message: "The search query is empty" }))
  }

  if ([...query].length > 128) {
    return Effect.fail(
      new DeepSeekError({ status: 0, message: "The search query must be at most 128 characters" }),
    )
  }

  const oriQuestion = input.oriQuestion?.trim()
  if (oriQuestion && [...oriQuestion].length > 128) {
    return Effect.fail(
      new DeepSeekError({
        status: 0,
        message: "The original question must be at most 128 characters",
      }),
    )
  }

  const localization = input.localization?.trim()
  if (localization && isIP(localization) === 0) {
    return Effect.fail(
      new DeepSeekError({ status: 0, message: "Localization must be an IPv4 or IPv6 address" }),
    )
  }

  return request(
    http,
    { ...input, statusErrors },
    "/v1/tools/search",
    SearchRequest,
    {
      query,
      ...(input.count === undefined ? {} : { count: clamp(input.count, 1, 50) }),
      ...(oriQuestion ? { ori_question: oriQuestion } : {}),
      ...(localization ? { localization } : {}),
      ...(input.needContent === undefined ? {} : { need_content: input.needContent }),
    },
    SearchResponse,
    searchResponseBytes(input),
    input.maxRetries ?? 0,
  ).pipe(Effect.flatMap((response) => decodeSearchResults(response.results, input)))
}

function decodeSearchResults(rawResults: readonly unknown[], input: ClientSearchInput) {
  const results = rawResults
    .map((raw) => Option.getOrUndefined(Schema.decodeUnknownOption(RawSearchResult)(raw)))
    .map((result) => (result ? toResult(result, input) : undefined))
    .filter((result): result is SearchResult => result !== undefined)

  if (rawResults.length > 0 && results.length === 0) {
    return Effect.fail(
      new DeepSeekError({
        status: 0,
        message: "DeepSeek returned search results without usable HTTP URLs",
        code: "invalid_response",
      }),
    )
  }

  return Effect.succeed(results)
}

function toResult(
  result: Schema.Schema.Type<typeof RawSearchResult>,
  input: ClientSearchInput,
): SearchResult | undefined {
  if (!isHttpURL(result.url)) {
    return undefined
  }

  const snippet = truncateText(nonEmpty(result.snippet) ?? "", input.maxSummaryChars) || undefined
  const summary = truncateText(nonEmpty(result.summary) ?? "", input.maxSummaryChars) || undefined
  const content = truncateText(nonEmpty(result.content) ?? "", input.maxContentChars) || undefined
  const siteName = nonEmpty(result.site_name ?? undefined)
  const siteIcon = nonEmpty(result.site_icon ?? undefined)
  const date = nonEmpty(result.date ?? undefined)
  const url = new URL(result.url)
  const publishedAt = date ? Date.parse(date) : undefined

  return {
    title: result.title?.trim() || result.url,
    url: result.url,
    domain: url.hostname.replace(/^www\./, ""),
    ...(snippet ? { snippet } : {}),
    ...(summary ? { summary } : {}),
    ...(content ? { content } : {}),
    ...(input.maxContentChars !== undefined &&
    result.content !== undefined &&
    [...result.content].length > input.maxContentChars
      ? { contentTruncated: true }
      : {}),
    ...(siteName ? { siteName } : {}),
    ...(siteIcon ? { siteIcon } : {}),
    ...(date ? { date } : {}),
    ...(publishedAt !== undefined && Number.isFinite(publishedAt) ? { publishedAt } : {}),
    ...(result.authority === undefined ? {} : { authority: result.authority }),
    ...(result.rerank_score === undefined ? {} : { rerankScore: result.rerank_score }),
  }
}

function searchResponseBytes(input: ClientSearchInput) {
  if (!input.needContent) {
    return MAX_SEARCH_RESPONSE_BYTES
  }

  const count = clamp(input.count ?? 8, 1, 50)
  const perResult = (input.maxContentChars ?? 20_000) + (input.maxSummaryChars ?? 4_000) + 4_096
  return Math.min(
    MAX_SEARCH_RESPONSE_BYTES_LIMIT,
    Math.max(MAX_SEARCH_RESPONSE_BYTES, count * perResult),
  )
}

function isHttpURL(value: string) {
  if (!URL.canParse(value)) {
    return false
  }

  const url = new URL(value)
  return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}

function asDeepSeekError(error: DeepSeekError | HttpClientError.HttpClientError) {
  if (error instanceof DeepSeekError) {
    return error
  }

  return new DeepSeekError({ status: 0, message: error.message, code: "network_error" })
}
