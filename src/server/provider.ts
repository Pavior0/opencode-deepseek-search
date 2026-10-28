import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import type { HttpClient } from "effect/http"
import { WebSearch } from "@opencode/plugin/effect"
import type { ResolvedOptions } from "../options.js"
import type { SearchResult } from "../rpc.js"
import { DeepSeekError } from "./http.js"
import type { ResolvedKey } from "./credential.js"
import { searchProvider } from "./search.js"

export const providerID = WebSearch.ID.make("deepseek")

export function registerWebSearch(
  ctx: Context,
  http: HttpClient.HttpClient,
  options: ResolvedOptions,
  requireKey: Effect.Effect<ResolvedKey | undefined, unknown>,
) {
  return ctx.websearch.transform((editor) => {
    editor.add({
      id: providerID,
      name: "DeepSeek Search",
      execute: ({ query }) =>
        queryWebSearch(http, options, requireKey, query).pipe(
          Effect.map((results) => results.map(toWebSearchResult)),
        ),
    })

    if (options.defaultProvider) {
      editor.default.set(providerID)
    }
  })
}

function queryWebSearch(
  http: HttpClient.HttpClient,
  options: ResolvedOptions,
  requireKey: Effect.Effect<ResolvedKey | undefined, unknown>,
  query: string,
) {
  return requireKey.pipe(
    Effect.flatMap((key) => {
      if (!key) {
        return Effect.fail(
          new DeepSeekError({ status: 0, message: "DeepSeek API key is not configured" }),
        )
      }

      return searchProvider(http, {
        apiKey: key.key,
        baseURL: options.baseURL,
        query,
        count: options.count,
        needContent: options.needContent,
        localization: options.localization,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
        maxContentChars: options.maxContentChars,
        maxSummaryChars: options.maxSummaryChars,
      })
    }),
  )
}

function toWebSearchResult(result: SearchResult): WebSearch.Result {
  const content = result.content ?? result.summary ?? result.snippet
  const published = result.date ? Date.parse(result.date) : undefined
  return {
    url: result.url,
    title: result.title,
    ...(content ? { content } : {}),
    time: published !== undefined && Number.isFinite(published) ? { published } : {},
  }
}
