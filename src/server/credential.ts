import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import type { ResolvedOptions } from "../options.js"

export type KeySource = "option" | "connection" | "provider" | "env"

export interface ResolvedKey {
  readonly key: string
  readonly source: KeySource
  readonly label: string
}

export const resolveKey = Effect.fnUntraced(function* (
  ctx: Context,
  options: ResolvedOptions,
  providerKey: Effect.Effect<string | undefined, unknown>,
): Effect.fn.Return<ResolvedKey | undefined, unknown> {
  if (options.apiKey) {
    return { key: options.apiKey, source: "option", label: "Plugin option" }
  }

  const connection = yield* ctx.integration.connection.active("deepseek")
  if (connection?.type === "credential") {
    const credential = yield* ctx.integration.connection.resolve(connection)
    if (credential?.type === "key") {
      const key = credential.key.trim()
      if (key) {
        return { key, source: "connection", label: connection.label }
      }
    }
    if (credential?.type === "oauth") {
      const key = credential.access.trim()
      if (key) {
        return { key, source: "connection", label: connection.label }
      }
    }
  }

  const configured = yield* providerKey
  if (configured)
    return { key: configured, source: "provider", label: "DeepSeek provider settings" }

  if (connection?.type === "env") {
    const credential = yield* ctx.integration.connection.resolve(connection)
    if (credential?.type === "key") {
      const key = credential.key.trim()
      if (key) {
        return { key, source: "env", label: connection.name }
      }
    }
  }

  for (const name of options.env) {
    const value = process.env[name]?.trim()
    if (value) {
      return { key: value, source: "env", label: name }
    }
  }

  return undefined
})
