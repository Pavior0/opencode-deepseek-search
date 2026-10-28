import {
  Contract,
  createKeyed,
  createLatest,
  usePlugin,
  type MountedSession,
  type SessionRef,
  type SessionScreen,
  type SetupContext,
} from "@opencode/plugin/gui"
import { For, Show, createSignal, onCleanup, type Accessor } from "solid-js"
import { DeepSeek, type SearchResult } from "../rpc.js"
import deepseekLogo from "../../assets/deepseek-logo.svg?raw"
import { insertIntoComposer } from "./composer.js"
import type { definition } from "./definition.js"
import { openFetch } from "./fetch-dialog.js"
import type { LastRun, Seed } from "./types.js"

type Ctx = SetupContext<typeof definition>

interface Browser {
  attached(session: SessionRef): boolean
  canOpen(session: SessionRef, path?: string): boolean
  open(session: SessionRef, url: string): void
  openFile(session: SessionRef, path: string): void
}

const Browser = Contract.define<Browser, "browser">("browser")

interface SearchPanelProps {
  readonly session: MountedSession
  readonly screen: SessionScreen
  readonly seed: Accessor<Seed | undefined>
  readonly onSeed: (at: number) => void
  readonly onLast: (run: LastRun) => void
  readonly statusEpoch: Accessor<number>
}

export function SearchPanel(props: SearchPanelProps) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const browser = ctx.use(Browser)
  const [query, setQuery] = createSignal("")
  const [originalQuestion, setOriginalQuestion] = createSignal<string>()
  const [results, setResults] = createSignal<readonly SearchResult[]>([])
  const [error, setError] = createSignal<string>()
  const [loading, setLoading] = createSignal(false)
  const [latency, setLatency] = createSignal<number>()
  const [lastQuery, setLastQuery] = createSignal<string>()
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set<string>())
  let controller: AbortController | undefined

  onCleanup(() => controller?.abort())

  createKeyed(
    () => props.session.key,
    () => {
      controller?.abort()
      controller = undefined
      setQuery("")
      setOriginalQuestion(undefined)
      setResults([])
      setError(undefined)
      setLoading(false)
      setLatency(undefined)
      setLastQuery(undefined)
      setSelected(new Set<string>())
    },
  )

  const location = () =>
    props.session.directory ? { directory: props.session.directory } : undefined
  const client = () => props.session.server.client

  const status = createLatest(
    () => `${props.statusEpoch()}:${props.session.directory}`,
    async (_epoch, signal) => client().rpc(DeepSeek).status({}, { location: location(), signal }),
  )

  const openResult = (url: string) => {
    const live = browser()
    if (live.status === "active" && live.value.canOpen(props.session, url)) {
      live.value.open(props.session, url)
      return
    }
    ctx.system.openExternal(url)
  }

  const run = async (value: string, question = originalQuestion()) => {
    const text = value.trim()
    if (!text) {
      return
    }
    controller?.abort()
    const current = new AbortController()
    controller = current
    const sessionKey = props.session.key
    setLoading(true)
    setError(undefined)
    setSelected(new Set<string>())
    try {
      const result = await client()
        .rpc(DeepSeek)
        .search(
          {
            query: text,
            count: ctx.stores.prefs.value.count,
            needContent: ctx.stores.prefs.value.needContent,
            oriQuestion: question || undefined,
          },
          { location: location(), signal: current.signal },
        )
      if (current.signal.aborted) {
        return
      }
      if (props.session.key === sessionKey) {
        setResults(result.results)
        setLatency(result.latencyMs)
        setLastQuery(text)
        props.onLast({
          sessionKey,
          query: text,
          count: result.results.length,
          latencyMs: result.latencyMs,
          at: Date.now(),
          results: result.results,
        })
      }
      ctx.stores.history.update((draft) => {
        draft.entries = [
          { query: text, count: result.results.length, at: Date.now() },
          ...draft.entries.filter((entry) => entry.query !== text),
        ].slice(0, 12)
      })
    } catch (cause) {
      if (current.signal.aborted || props.session.key !== sessionKey) {
        return
      }
      setError(errorText(cause))
    } finally {
      if (controller === current) {
        controller = undefined
        setLoading(false)
      }
    }
  }

  const insertSelected = () => {
    const items = results().filter((result) => selected().has(result.url))
    if (items.length === 0) {
      return
    }
    const text = [
      ctx.t("research.header", { query: lastQuery() ?? query() }),
      ctx.t("research.untrusted"),
      ...items.map((result, index) =>
        [
          `${index + 1}. ${result.title}`,
          `URL: ${result.url}`,
          result.summary ?? result.snippet ?? result.content,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ].join("\n\n")
    insertIntoComposer(ctx, props.screen, text, ctx.t("title"), ctx.t("research.subject"))
    ctx.toast.show({ title: ctx.t("research.inserted", { count: items.length }) })
    setSelected(new Set<string>())
  }

  createKeyed(
    () => (props.seed()?.key === props.session.key ? props.seed()?.at : undefined),
    (at) => {
      const seed = props.seed()
      if (!seed || seed.at !== at) {
        return
      }
      setQuery(seed.query)
      setOriginalQuestion(seed.oriQuestion)
      props.onSeed(at)
      if (seed.results) {
        controller?.abort()
        controller = undefined
        setError(undefined)
        setLoading(false)
        setSelected(new Set<string>())
        setResults(seed.results)
        setLatency(seed.latencyMs)
        setLastQuery(seed.query)
        return
      }
      void run(seed.query, seed.oriQuestion)
    },
  )

  return (
    <div class="ds-panel">
      <header class="ds-head">
        <div class="ds-brand">
          <div class="ds-brand-logo" aria-hidden="true" innerHTML={deepseekLogo} />
          <div>
            <h2 class="ds-title">{ctx.t("panel.title")}</h2>
            <p class="ds-subtitle">{ctx.t("panel.subtitle")}</p>
          </div>
        </div>
        <Show when={status.latest && !status.latest.available}>
          <ui.Button
            variant="ghost-muted"
            size="small"
            icon="providers"
            onClick={() => ctx.layout.settings("deepseek")}
          >
            {ctx.t("panel.configure")}
          </ui.Button>
        </Show>
      </header>

      <div class="ds-searchbar">
        <ui.TextInput
          label={ctx.t("search.label")}
          placeholder={ctx.t("search.placeholder")}
          value={query()}
          onInput={setQuery}
          onSubmit={(value) => void run(value)}
          type="search"
        />
        <ui.Button
          variant="contrast"
          size="normal"
          icon="magnifying-glass"
          busy={loading()}
          onClick={() => void run(query())}
        >
          {ctx.t("search.run")}
        </ui.Button>
        <ui.Tooltip value={ctx.t("search.options")}>
          <ui.Menu
            label={ctx.t("search.options")}
            trigger="icon"
            icon="magnifying-glass-menu"
            placement="bottom-end"
            items={[
              {
                type: "group" as const,
                label: ctx.t("search.options.results"),
                items: [5, 8, 12, 20].map((value) => ({
                  label: `${value === ctx.stores.prefs.value.count ? "✓ " : ""}${ctx.t("search.count", { count: value })}`,
                  onSelect: () =>
                    ctx.stores.prefs.update((draft) => {
                      draft.count = value
                    }),
                })),
              },
              {
                type: "group" as const,
                label: ctx.t("search.options.content"),
                items: [
                  {
                    label: `${!ctx.stores.prefs.value.needContent ? "✓ " : ""}${ctx.t("search.content.summary")}`,
                    onSelect: () =>
                      ctx.stores.prefs.update((draft) => {
                        draft.needContent = false
                      }),
                  },
                  {
                    label: `${ctx.stores.prefs.value.needContent ? "✓ " : ""}${ctx.t("search.content.fullText")}`,
                    onSelect: () =>
                      ctx.stores.prefs.update((draft) => {
                        draft.needContent = true
                      }),
                  },
                ],
              },
            ]}
          />
        </ui.Tooltip>
      </div>

      <Show when={originalQuestion() || selected().size > 0}>
        <div class="ds-toolbar">
          <Show when={originalQuestion()}>
            <span class="ds-context">{ctx.t("search.fromPrompt")}</span>
          </Show>
          <Show when={selected().size > 0}>
            <span class="ds-context">{ctx.plural("search.selected", selected().size)}</span>
            <ui.Button variant="neutral" size="small" onClick={insertSelected}>
              {ctx.t("search.insertSelected")}
            </ui.Button>
          </Show>
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <div class="ds-error">
            <div class="ds-error-title">{ctx.t("search.error")}</div>
            <p>{message()}</p>
            <ui.Button
              variant="ghost"
              size="small"
              icon="refresh"
              onClick={() => void run(query())}
            >
              {ctx.t("search.retry")}
            </ui.Button>
          </div>
        )}
      </Show>

      <Show when={loading() && results().length === 0}>
        <div class="ds-loading">
          <ui.Loader size="small" />
          <span>{ctx.t("search.running")}</span>
        </div>
      </Show>

      <Show when={!loading() && results().length === 0 && !error()}>
        <Show when={lastQuery()} fallback={<EmptySearch ctx={ctx} />}>
          {(value) => <div class="ds-empty-inline">{ctx.t("search.none", { query: value() })}</div>}
        </Show>
      </Show>

      <Show when={!loading() && results().length === 0 && !lastQuery() && !error()}>
        <RecentSearches
          entries={ctx.stores.history.value.entries.slice(0, 5)}
          onClear={() => ctx.stores.history.set({ entries: [] })}
          onSelect={(value) => {
            setQuery(value)
            void run(value, "")
          }}
          ctx={ctx}
        />
      </Show>

      <div class="ds-results" aria-live="polite">
        <For each={results()}>
          {(result, index) => (
            <ResultRow
              result={result}
              index={index()}
              selected={selected().has(result.url)}
              screen={props.screen}
              onOpen={openResult}
              onToggle={() =>
                setSelected((current) => {
                  const next = new Set(current)
                  if (next.has(result.url)) {
                    next.delete(result.url)
                  } else {
                    next.add(result.url)
                  }
                  return next
                })
              }
              onFetch={(item) =>
                openFetch(ctx, props.screen, item, client(), location(), () => openResult(item.url))
              }
            />
          )}
        </For>
      </div>

      <Show when={results().length > 0}>
        <footer class="ds-footer">
          <span>{ctx.plural("search.results", results().length)}</span>
          <Show when={latency() !== undefined}>
            <span>{ctx.t("search.latency", { ms: latency() ?? 0 })}</span>
          </Show>
        </footer>
      </Show>
    </div>
  )
}

function EmptySearch(props: { ctx: Ctx }) {
  const Icon = props.ctx.ui.Icon

  return (
    <div class="ds-empty">
      <div class="ds-empty-row">
        <div class="ds-empty-icon">
          <Icon name="outline-globe" size="small" />
        </div>
        <div class="ds-empty-copy">
          <p class="ds-empty-title">{props.ctx.t("search.empty.title")}</p>
          <p>{props.ctx.t("search.empty")}</p>
        </div>
      </div>
    </div>
  )
}

function RecentSearches(props: {
  readonly entries: readonly { query: string; count: number; at: number }[]
  readonly onClear: () => void
  readonly onSelect: (query: string) => void
  readonly ctx: Ctx
}) {
  return (
    <Show when={props.entries.length > 0}>
      <section class="ds-recent">
        <div class="ds-section-head">
          <span>{props.ctx.t("history.title")}</span>
          <button type="button" class="ds-link" onClick={props.onClear}>
            {props.ctx.t("settings.history.clear")}
          </button>
        </div>
        <div class="ds-recent-list">
          <For each={props.entries}>
            {(entry) => (
              <button
                type="button"
                class="ds-recent-item"
                onClick={() => props.onSelect(entry.query)}
              >
                <span>{entry.query}</span>
                <span class="ds-recent-meta">
                  <span>{recentAt(entry.at)}</span>
                  <span
                    class="ds-recent-count"
                    data-component="tag"
                    data-appearance="compact"
                    data-variant="subtle"
                  >
                    {entry.count}
                  </span>
                </span>
              </button>
            )}
          </For>
        </div>
      </section>
    </Show>
  )
}

function ResultRow(props: {
  readonly result: SearchResult
  readonly index: number
  readonly selected: boolean
  readonly screen: SessionScreen
  readonly onOpen: (url: string) => void
  readonly onToggle: () => void
  readonly onFetch: (result: SearchResult) => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const summary = () => props.result.summary ?? props.result.snippet ?? props.result.content
  const date = () => dateLabel(props.result.publishedAt, props.result.date)
  const domain = () => props.result.siteName ?? props.result.domain ?? hostname(props.result.url)

  const cite = () => {
    const text = [`[${props.result.title}](${props.result.url})`, summary()]
      .filter(Boolean)
      .join("\n")
    insertIntoComposer(ctx, props.screen, text, ctx.t("title"), props.result.title)
    ctx.toast.show({ title: ctx.t("result.cited") })
  }

  return (
    <article class="ds-result">
      <button
        type="button"
        class="ds-result-index"
        data-selected={props.selected ? "true" : "false"}
        aria-label={ctx.t(props.selected ? "result.deselect" : "result.select")}
        aria-pressed={props.selected}
        onClick={props.onToggle}
      >
        {props.selected ? "✓" : props.index + 1}
      </button>
      <div class="ds-result-body">
        <div class="ds-result-head">
          <button
            type="button"
            class="ds-result-title"
            onClick={() => props.onOpen(props.result.url)}
          >
            {props.result.title}
          </button>
          <span class="ds-meta">{domain()}</span>
        </div>
        <Show
          when={summary()}
          fallback={<p class="ds-summary ds-muted">{ctx.t("result.noSummary")}</p>}
        >
          {(text) => <p class="ds-summary">{text()}</p>}
        </Show>
        <div class="ds-result-footer">
          <div class="ds-meta-row">
            <Show when={date()}>
              {(value) => (
                <span
                  class="ds-result-date"
                  data-component="tag"
                  data-appearance="compact"
                  data-variant="subtle"
                >
                  {value()}
                </span>
              )}
            </Show>
            <Show when={props.result.content}>
              <span data-component="tag" data-appearance="compact" data-variant="subtle">
                {ctx.t("result.fullText")}
              </span>
            </Show>
            <Show when={props.result.contentTruncated}>
              <span data-component="tag" data-appearance="compact" data-variant="subtle">
                {ctx.t("result.truncated")}
              </span>
            </Show>
          </div>
          <div class="ds-actions">
            <ui.Button
              variant="ghost"
              size="small"
              icon="outline-square-arrow"
              onClick={() => props.onOpen(props.result.url)}
            >
              {ctx.t("result.open")}
            </ui.Button>
            <ui.Button
              variant="ghost"
              size="small"
              icon="outline-eye"
              onClick={() => props.onFetch(props.result)}
            >
              {ctx.t("result.preview")}
            </ui.Button>
            <ui.Button variant="ghost" size="small" icon="outline-quote" onClick={cite}>
              {ctx.t("result.cite")}
            </ui.Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function errorText(error: unknown) {
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message
    }
    if ("type" in error && typeof error.type === "string") {
      return error.type
    }
  }
  return String(error)
}

function dateLabel(publishedAt: number | undefined, value: string | undefined) {
  const time = publishedAt ?? (value ? Date.parse(value) : undefined)
  if (time === undefined || !Number.isFinite(time)) {
    return undefined
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(time)
}

function recentAt(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(
    value,
  )
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return value
  }
}
