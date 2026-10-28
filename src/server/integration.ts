import type { Context } from "@opencode/plugin/effect/plugin"
import type { ResolvedOptions } from "../options.js"

const integrationID = "deepseek"

export function registerIntegration(ctx: Context, options: ResolvedOptions) {
  return ctx.integration.transform((editor) => {
    editor.update(integrationID, (integration) => {
      integration.name = "DeepSeek"
    })

    editor.method.update({
      integrationID,
      method: { type: "key", label: "DeepSeek API key" },
    })

    editor.method.update({
      integrationID,
      method: { type: "env", names: options.env },
    })
  })
}
