import type { Context } from "@opencode/plugin/effect/plugin"
import { Clock, Effect } from "effect"
import type { HttpClient } from "effect/http"
import type { ResolvedOptions } from "../options.js"
import { DeepSeek } from "../rpc.js"
import type { ResolvedKey } from "./credential.js"
import { fetch } from "./fetch.js"
import { DeepSeekError } from "./http.js"
import { providerID } from "./provider.js"
import { search } from "./search.js"

export function registerRpc(
  ctx: Context,
  http: HttpClient.HttpClient,
  options: ResolvedOptions,
  requireKey: Effect.Effect<ResolvedKey | undefined, unknown>,
) {
  return ctx.rpc
    .register(DeepSeek, {
      status: () =>
        Effect.gen(function* () {
          const key = yield* requireKey.pipe(Effect.orDie)
          return {
            available: key !== undefined,
            source: key?.source ?? "none",
            baseURL: options.baseURL,
            envNames: options.env,
            ...(key?.label ? { label: key.label } : {}),
            ...(options.defaultProvider ? { defaultProvider: "deepseek" } : {}),
          }
        }),
      search: (input, context) =>
        Effect.gen(function* () {
          const key = yield* requireKey.pipe(
            Effect.catch((cause) =>
              Effect.fail(
                context.error("request_failed", message(cause), {
                  status: 0,
                  message: message(cause),
                }),
              ),
            ),
          )
          if (!key) {
            return yield* Effect.fail(
              context.error("not_configured", "DeepSeek API key is not configured", {}),
            )
          }

          const started = yield* Clock.currentTimeMillis
          const results = yield* search(http, {
            apiKey: key.key,
            baseURL: options.baseURL,
            query: input.query,
            count: input.count ?? options.count,
            oriQuestion: input.oriQuestion,
            needContent: input.needContent ?? options.needContent,
            localization: input.localization ?? options.localization,
            timeoutMs: options.timeoutMs,
            maxRetries: options.maxRetries,
            maxContentChars: options.maxContentChars,
            maxSummaryChars: options.maxSummaryChars,
          }).pipe(
            Effect.catchIf(
              (error): error is DeepSeekError => error instanceof DeepSeekError,
              (error) =>
                Effect.fail(
                  error.status === 429
                    ? context.error("rate_limited", error.message, {
                        ...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter }),
                      })
                    : context.error("request_failed", error.message, {
                        status: error.status,
                        message: error.message,
                      }),
                ),
            ),
          )

          return {
            providerID,
            latencyMs: (yield* Clock.currentTimeMillis) - started,
            results,
          }
        }),
      fetch: (input, context) =>
        Effect.gen(function* () {
          const key = yield* requireKey.pipe(
            Effect.catch((cause) =>
              Effect.fail(
                context.error("request_failed", message(cause), {
                  status: 0,
                  message: message(cause),
                }),
              ),
            ),
          )
          if (!key) {
            return yield* Effect.fail(
              context.error("not_configured", "DeepSeek API key is not configured", {}),
            )
          }

          const started = yield* Clock.currentTimeMillis
          const page = yield* fetch(http, {
            apiKey: key.key,
            baseURL: options.baseURL,
            url: input.url,
            timeoutMs: options.timeoutMs,
            maxRetries: options.maxRetries,
            maxFetchChars: options.maxFetchChars,
          }).pipe(
            Effect.catchIf(
              (error): error is DeepSeekError => error instanceof DeepSeekError,
              (error) =>
                Effect.fail(
                  context.error("request_failed", error.message, {
                    status: error.status,
                    message: error.message,
                  }),
                ),
            ),
          )

          return { ...page, latencyMs: (yield* Clock.currentTimeMillis) - started }
        }),
    })
    .pipe(Effect.orDie)
}

function message(cause: unknown) {
  if (cause instanceof Error && cause.message.trim()) {
    return cause.message
  }

  const text = String(cause).trim()
  return text || "DeepSeek request failed"
}
