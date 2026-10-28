import type { Scope } from "effect"
import { Effect } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { Provider } from "@opencode/plugin/effect"
import { define } from "@opencode/plugin/effect/plugin"
import { resolveOptions } from "../options.js"
import { registerIntegration } from "./integration.js"
import { resolveKey } from "./credential.js"
import { registerRpc } from "./rpc.js"
import { registerTools } from "./tools.js"
import { registerWebSearch } from "./provider.js"

const integrationID = "deepseek"

export const Plugin = define<Scope.Scope>({
  id: "opencode-deepseek-search",
  effect: Effect.fn("DeepSeekPlugin")(function* (ctx) {
    const options = resolveOptions(ctx.options)
    const providerKey = Effect.gen(function* () {
      const provider = yield* ctx.provider
        .get({ providerID: Provider.ID.make(integrationID) })
        .pipe(Effect.orElseSucceed(() => undefined))
      const value = provider?.data.settings?.apiKey
      return typeof value === "string" && value.trim() ? value.trim() : undefined
    })
    const http = yield* HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer))

    yield* registerIntegration(ctx, options)

    const requireKey = resolveKey(ctx, options, providerKey)
    yield* registerWebSearch(ctx, http, options, requireKey)
    yield* registerTools(ctx, http, options, requireKey)
    yield* registerRpc(ctx, http, options, requireKey)
  }),
})
