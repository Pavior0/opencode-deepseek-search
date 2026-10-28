import {
  Command,
  ComposerPill,
  MenuItem,
  Panel,
  SettingsPage,
  Style,
  type ComposerPillRow,
  type ComposerPillView,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import type { definition } from "./definition.js"
import { SearchPanel } from "./panel.js"
import { Settings } from "./settings.js"
import css from "./styles.css?inline"
import type { LastRun, Seed } from "./types.js"

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const [seed, setSeed] = createSignal<Seed>()
  const [last, setLast] = createSignal<LastRun>()
  const [statusEpoch, setStatusEpoch] = createSignal(0)

  const openSearch = (
    query?: string,
    oriQuestion?: string,
    cached?: Pick<LastRun, "results" | "latencyMs">,
  ) => {
    const session = ctx.sessions.current()
    if (!session) {
      return
    }
    if (query?.trim()) {
      setSeed({
        key: session.key,
        query: query.trim(),
        oriQuestion,
        results: cached?.results,
        latencyMs: cached?.latencyMs,
        at: Date.now(),
      })
    }
    ctx.layout.open(`${ctx.id}:search`, session, { tab: ctx.layout.narrow() ? "open" : "select" })
  }

  ctx.add(Style, css)

  ctx.add(Command, {
    id: "open",
    get title() {
      return ctx.t("command.open.title")
    },
    get description() {
      return ctx.t("command.open.description")
    },
    keywords: "deepseek search web internet",
    get group() {
      return ctx.t("title")
    },
    slash: { name: "ds", arguments: true },
    get enabled() {
      return (
        ctx.stores.prefs.value.panel !== false &&
        ctx.stores.prefs.value.commands !== false &&
        !!ctx.sessions.current()
      )
    },
    run: (input) => openSearch(input),
  })

  ctx.add(Command, {
    id: "search-prompt",
    get title() {
      return ctx.t("command.search.title")
    },
    get description() {
      return ctx.t("command.search.description")
    },
    keywords: "deepseek search prompt selection",
    get group() {
      return ctx.t("title")
    },
    get enabled() {
      return (
        ctx.stores.prefs.value.panel !== false &&
        ctx.stores.prefs.value.commands !== false &&
        !!ctx.sessions.current()
      )
    },
    run: () => {
      if (!ctx.sessions.current()) return
      const prompt = ctx.screen.current()?.composer.text()
      openSearch(prompt, prompt)
    },
  })

  const searchTab: PanelTab = {
    id: "search",
    get title() {
      return ctx.t("panel.title")
    },
    closable: "compact",
    fallback: true,
  }

  ctx.add(Panel, {
    id: "search",
    region: "side",
    mobile: {
      get title() {
        return ctx.t("panel.mobile")
      },
      order: 42,
      kind: "menu",
      icon: "outline-globe",
    },
    list: (input) =>
      ctx.stores.prefs.value.panel !== false && input.open.includes("search") ? [searchTab] : [],
    render: (props) => (
      <SearchPanel
        session={props.session}
        screen={props.screen}
        seed={seed}
        onSeed={(at) => setSeed((current) => (current?.at === at ? undefined : current))}
        onLast={(run) => setLast(run)}
        statusEpoch={statusEpoch}
      />
    ),
  })

  ctx.add(MenuItem, (): MenuItem | undefined => {
    if (ctx.stores.prefs.value.panel === false) {
      return undefined
    }
    const session = ctx.sessions.current()

    return {
      menu: "session.panel",
      id: "search",
      title: ctx.t("panel.title"),
      icon: "outline-globe",
      order: 42,
      opened: !!session && ctx.layout.state(`${ctx.id}:search`, session) !== "closed",
      run: () => openSearch(),
    }
  })

  ctx.add(SettingsPage, {
    id: "deepseek",
    icon: "outline-globe",
    get title() {
      return ctx.t("settings.title")
    },
    get entries() {
      return [
        {
          id: "connection",
          title: ctx.t("settings.connection"),
          keywords: "deepseek api key search",
        },
        {
          id: "behavior",
          title: ctx.t("settings.behavior"),
          keywords: "count full text pill panel commands",
        },
      ]
    },
    render: () => (
      <Settings statusEpoch={statusEpoch} onStatus={() => setStatusEpoch((value) => value + 1)} />
    ),
  })

  ctx.add(ComposerPill, {
    id: "last-search",
    order: 42,
    show: (input) => {
      const run = last()
      if (!run || run.sessionKey !== input.session.key || !ctx.stores.pill.value.enabled)
        return undefined
      const rows: ComposerPillRow[] = [
        ...run.results.slice(0, 4).map((result) => ({
          id: result.url,
          label: result.title,
          detail: result.siteName,
          icon: "arrow-up-right" as const,
          run: () => ctx.system.openExternal(result.url),
        })),
        {
          id: "open",
          label: ctx.t("pill.open"),
          icon: "outline-globe",
          run: () => openSearch(run.query, undefined, run),
        },
      ]
      const view: ComposerPillView = {
        icon: "outline-globe",
        label: ctx.plural("pill.label", run.results.length),
        title: ctx.t("pill.title", { query: run.query }),
        ...(run.results.length > 0 ? { rows } : {}),
        run: () => openSearch(run.query, undefined, run),
      }
      return view
    },
  })
}
