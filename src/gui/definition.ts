import { Plugin, Store } from "@opencode/plugin/gui"
import { Schema } from "effect"
import en from "./i18n/en.js"
import zh from "./i18n/zh.js"

const Prefs = Schema.Struct({
  count: Schema.Number,
  needContent: Schema.Boolean,
  panel: Schema.Boolean,
  commands: Schema.Boolean,
})

const PillPrefs = Schema.Struct({
  enabled: Schema.Boolean,
})

const History = Schema.Struct({
  entries: Schema.Array(
    Schema.Struct({
      query: Schema.String,
      count: Schema.Number,
      at: Schema.Number,
    }),
  ),
})

export const definition = Plugin.define({
  stores: {
    prefs: Store.global(Prefs, { count: 8, needContent: false, panel: true, commands: true }),
    pill: Store.global(PillPrefs, { enabled: false }),
    history: Store.global(History, { entries: [] }),
  },
  i18n: { en, zh },
})
