import { Rpc } from "@opencode/plugin/rpc"
import { Schema } from "effect"

/** The camelCase result shape shared by the server, GUI, and external RPC clients. */
export const SearchResultSchema = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  domain: Schema.optionalKey(Schema.String),
  snippet: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  content: Schema.optionalKey(Schema.String),
  contentTruncated: Schema.optionalKey(Schema.Boolean),
  siteName: Schema.optionalKey(Schema.String),
  siteIcon: Schema.optionalKey(Schema.String),
  date: Schema.optionalKey(Schema.String),
  publishedAt: Schema.optionalKey(Schema.Number),
  authority: Schema.optionalKey(Schema.Number),
  rerankScore: Schema.optionalKey(Schema.Number),
})
export type SearchResult = Schema.Schema.Type<typeof SearchResultSchema>

const StatusSchema = Schema.Struct({
  available: Schema.Boolean,
  source: Schema.Literals(["option", "connection", "provider", "env", "none"]),
  label: Schema.optionalKey(Schema.String),
  baseURL: Schema.String,
  defaultProvider: Schema.optionalKey(Schema.String),
  envNames: Schema.Array(Schema.String),
})
export type Status = Schema.Schema.Type<typeof StatusSchema>

export const SearchCountSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(50),
)

export const SearchInputSchema = Schema.Struct({
  query: Schema.String,
  count: Schema.optionalKey(SearchCountSchema),
  needContent: Schema.optionalKey(Schema.Boolean),
  oriQuestion: Schema.optionalKey(Schema.String),
  localization: Schema.optionalKey(Schema.String),
})
export type SearchInput = Schema.Schema.Type<typeof SearchInputSchema>

export const SearchOutputSchema = Schema.Struct({
  providerID: Schema.String,
  latencyMs: Schema.Number,
  results: Schema.Array(SearchResultSchema),
})

export const FetchInputSchema = Schema.Struct({ url: Schema.String })

export const FetchOutputSchema = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  content: Schema.String,
  contentTruncated: Schema.Boolean,
  contentChars: Schema.Number,
  latencyMs: Schema.Number,
})

const Empty = Schema.toStandardSchemaV1(Schema.Struct({}))
const NotConfigured = Schema.toStandardSchemaV1(Schema.Struct({}))
const RateLimited = Schema.toStandardSchemaV1(
  Schema.Struct({ retryAfter: Schema.optionalKey(Schema.Number) }),
)
const RequestFailed = Schema.toStandardSchemaV1(
  Schema.Struct({ status: Schema.Number, message: Schema.String }),
)
const StatusValue = Schema.toStandardSchemaV1(StatusSchema)

/** The server RPC contract exposed to the GUI and other OpenCode clients. */
export const DeepSeek = Rpc.define({
  id: "deepseek",
  methods: {
    status: {
      input: Empty,
      output: StatusValue,
    },
    search: {
      input: Schema.toStandardSchemaV1(SearchInputSchema),
      output: Schema.toStandardSchemaV1(SearchOutputSchema),
      errors: {
        not_configured: NotConfigured,
        rate_limited: RateLimited,
        request_failed: RequestFailed,
      },
    },
    fetch: {
      input: Schema.toStandardSchemaV1(FetchInputSchema),
      output: Schema.toStandardSchemaV1(FetchOutputSchema),
      errors: {
        not_configured: NotConfigured,
        request_failed: RequestFailed,
      },
    },
  },
  events: {},
})
