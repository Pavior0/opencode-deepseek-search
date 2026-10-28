import type { OpenCodeClient } from "@opencode/client/promise"
import type { SessionScreen, SetupContext } from "@opencode/plugin/gui"
import { Show, createSignal, onCleanup, onMount } from "solid-js"
import { DeepSeek, type SearchResult } from "../rpc.js"
import { insertIntoComposer } from "./composer.js"
import type { definition } from "./definition.js"

type Ctx = SetupContext<typeof definition>
type Location = { readonly directory: string } | undefined

interface FetchState {
  readonly status: "loading" | "ready" | "error"
  readonly title?: string
  readonly content?: string
  readonly contentTruncated?: boolean
  readonly latencyMs?: number
  readonly message?: string
}

export function openFetch(
  ctx: Ctx,
  screen: SessionScreen,
  result: SearchResult,
  client: OpenCodeClient,
  location: Location,
  onOpen: () => void,
) {
  ctx.dialogs.open((dialog) => (
    <FetchDialog
      ctx={ctx}
      client={client}
      dialog={dialog}
      screen={screen}
      result={result}
      location={location}
      onOpen={onOpen}
    />
  ))
}

function FetchDialog(props: {
  readonly ctx: Ctx
  readonly client: OpenCodeClient
  readonly dialog: { close(): void }
  readonly screen: SessionScreen
  readonly result: SearchResult
  readonly location: Location
  readonly onOpen: () => void
}) {
  const ui = props.ctx.ui
  const [state, setState] = createSignal<FetchState>({ status: "loading" })
  const controller = new AbortController()

  onCleanup(() => controller.abort())

  const load = async () => {
    setState({ status: "loading" })
    try {
      const page = await props.client
        .rpc(DeepSeek)
        .fetch({ url: props.result.url }, { location: props.location, signal: controller.signal })
      if (controller.signal.aborted) {
        return
      }
      setState({
        status: "ready",
        title: page.title,
        content: page.content,
        contentTruncated: page.contentTruncated,
        latencyMs: page.latencyMs,
      })
    } catch (cause) {
      if (controller.signal.aborted) {
        return
      }
      setState({ status: "error", message: errorText(cause) })
    }
  }

  onMount(() => {
    void load()
  })

  const insert = () => {
    const value = state()
    if (value.status !== "ready" || !value.content) {
      return
    }
    const text = [value.title || props.result.title, props.result.url, value.content]
      .filter(Boolean)
      .join("\n")
    insertIntoComposer(
      props.ctx,
      props.screen,
      text,
      props.ctx.t("title"),
      "a page fetched by DeepSeek",
    )
    props.ctx.toast.show({ title: props.ctx.t("dialog.fetch.inserted") })
    props.dialog.close()
  }

  return (
    <ui.Dialog
      title={state().title || props.ctx.t("dialog.fetch.title")}
      description={props.result.url}
      size="large"
      footer={
        <div class="ds-dialog-actions">
          <ui.Button variant="ghost" icon="outline-square-arrow" onClick={props.onOpen}>
            {props.ctx.t("dialog.fetch.openInApp")}
          </ui.Button>
          <ui.Button
            variant="neutral"
            icon="outline-copy"
            disabled={state().status !== "ready"}
            onClick={() => {
              void props.ctx.system.copy(state().content ?? "").then(
                () => props.ctx.toast.show({ title: props.ctx.t("settings.copied") }),
                () =>
                  props.ctx.toast.show({
                    variant: "error",
                    title: props.ctx.t("settings.copy.failed"),
                  }),
              )
            }}
          >
            {props.ctx.t("dialog.fetch.copy")}
          </ui.Button>
          <ui.Button
            variant="contrast"
            icon="outline-quote"
            disabled={state().status !== "ready"}
            onClick={insert}
          >
            {props.ctx.t("dialog.fetch.insertContent")}
          </ui.Button>
        </div>
      }
    >
      <Show when={state().status === "loading"}>
        <div class="ds-loading">
          <ui.Loader size="large" />
          <span>{props.ctx.t("dialog.fetch.loading")}</span>
        </div>
      </Show>
      <Show when={state().status === "error"}>
        <div class="ds-error">
          <div class="ds-error-title">{props.ctx.t("dialog.fetch.failed")}</div>
          <p>{state().message}</p>
          <p class="ds-fetch-error-hint">{props.ctx.t("dialog.fetch.errorHint")}</p>
          <ui.Button variant="ghost" size="small" icon="refresh" onClick={() => void load()}>
            {props.ctx.t("search.retry")}
          </ui.Button>
        </div>
      </Show>
      <Show when={state().status === "ready"}>
        <div class="ds-fetch-meta">
          <span>{props.ctx.t("dialog.fetch.source", { domain: hostname(props.result.url) })}</span>
          <Show when={state().latencyMs !== undefined}>
            <span>{props.ctx.t("search.latency", { ms: state().latencyMs ?? 0 })}</span>
          </Show>
        </div>
        <ui.Markdown text={state().content ?? ""} class="ds-fetch-content" />
        <Show when={state().contentTruncated}>
          <p class="ds-fetch-note">{props.ctx.t("dialog.fetch.truncated")}</p>
        </Show>
      </Show>
    </ui.Dialog>
  )
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return value
  }
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
