import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { Show, createSignal, onCleanup } from "solid-js"
import { DeepSeek } from "../rpc.js"
import type { definition } from "./definition.js"

export function Settings(props: {
  readonly statusEpoch: () => number
  readonly onStatus: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [key, setKey] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [testing, setTesting] = createSignal(false)
  let disposed = false

  onCleanup(() => {
    disposed = true
  })

  const client = () => ctx.sessions.current()?.server.client ?? ctx.client
  const location = () => {
    const session = ctx.sessions.current()
    return session ? { directory: session.directory } : undefined
  }

  const status = createLatest(
    () =>
      `${props.statusEpoch()}:${ctx.sessions.current()?.server.id ?? ""}:${ctx.sessions.current()?.directory ?? ""}`,
    async (_epoch, signal) => client().rpc(DeepSeek).status({}, { location: location(), signal }),
  )

  const sourceText = () => {
    if (status.error) {
      return ctx.t("settings.connection.error")
    }
    if (!status.latest) {
      return ctx.t("settings.connection.checking")
    }
    if (!status.latest.available) {
      return ctx.t("settings.connection.none")
    }
    return ctx.t("settings.connection.source", {
      source: status.latest.label ?? status.latest.source,
    })
  }

  const save = async () => {
    const value = key().trim()
    if (!value || saving()) {
      return
    }
    setSaving(true)
    try {
      await client().integration.connect.key({ integrationID: "deepseek", key: value })
      if (disposed) {
        return
      }
      setKey("")
      props.onStatus()
      ctx.toast.show({ variant: "success", title: ctx.t("settings.key.saved") })
    } catch (cause) {
      if (!disposed) {
        ctx.toast.show({
          variant: "error",
          title: ctx.t("settings.key.failed"),
          description: errorText(cause),
        })
      }
    } finally {
      if (!disposed) {
        setSaving(false)
      }
    }
  }

  const test = async () => {
    if (testing()) {
      return
    }
    setTesting(true)
    try {
      const result = await client()
        .rpc(DeepSeek)
        .search({ query: "DeepSeek", count: 1, needContent: false }, { location: location() })
      if (disposed) {
        return
      }
      ctx.toast.show({
        variant: "success",
        title: ctx.t("settings.test.ok", { ms: result.latencyMs }),
      })
      props.onStatus()
    } catch (cause) {
      if (!disposed) {
        ctx.toast.show({
          variant: "error",
          title: ctx.t("settings.test.failed"),
          description: errorText(cause),
        })
      }
    } finally {
      if (!disposed) {
        setTesting(false)
      }
    }
  }

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex min-w-0 flex-col gap-1">
            <div class="ds-title-row">
              <h2 class="settings-tab-title">{ctx.t("settings.title")}</h2>
              <span
                class="ds-unofficial-tag"
                data-component="tag"
                data-appearance="neutral"
                data-variant="subtle"
              >
                {ctx.t("panel.unofficial")}
              </span>
            </div>
            <span class="text-11-regular text-v2-text-text-muted">
              {ctx.t("settings.description")}
            </span>
          </div>
        </div>
      </div>

      <div class="settings-tab-body settings-tab-body--sectioned">
        <div class="ds-settings">
          <section class="ds-settings-section">
            <h3>{ctx.t("settings.connection")}</h3>
            <div class="ds-settings-list" data-component="settings-list" data-variant="catalog">
              <div class="ds-settings-row" data-component="settings-row">
                <div class="ds-settings-copy" data-slot="settings-row-copy">
                  <div class="ds-settings-main">
                    <strong>{ctx.t("settings.connection.name")}</strong>
                    <span
                      class="ds-settings-status"
                      data-on={!status.error && status.latest?.available ? "true" : "false"}
                    >
                      {status.latest?.available
                        ? ctx.t("settings.connection.connected")
                        : ctx.t("settings.connection.unavailable")}
                    </span>
                  </div>
                  <span>
                    {sourceText()} ·{" "}
                    <button
                      type="button"
                      class="ds-inline-link"
                      onClick={() => ctx.layout.settings("providers")}
                    >
                      {ctx.t("settings.openProviders")}
                    </button>
                  </span>
                </div>
                <div class="ds-settings-control" data-slot="settings-row-control">
                  <ui.Button
                    variant="neutral"
                    size="small"
                    busy={testing()}
                    onClick={() => void test()}
                  >
                    {ctx.t("settings.test")}
                  </ui.Button>
                </div>
              </div>
              <Show when={status.latest && !status.latest.available}>
                <div class="ds-settings-row" data-component="settings-row">
                  <div class="ds-settings-copy" data-slot="settings-row-copy">
                    <strong>{ctx.t("settings.key.label")}</strong>
                    <span>{ctx.t("settings.connection.none")}</span>
                  </div>
                  <div class="ds-settings-control ds-key-entry" data-slot="settings-row-control">
                    <ui.TextInput
                      label={ctx.t("settings.key.label")}
                      placeholder={ctx.t("settings.key.placeholder")}
                      type="password"
                      value={key()}
                      onInput={setKey}
                      onSubmit={() => void save()}
                    />
                    <ui.Button
                      variant="contrast"
                      size="small"
                      busy={saving()}
                      disabled={!key().trim()}
                      onClick={() => void save()}
                    >
                      {ctx.t("settings.key.save")}
                    </ui.Button>
                  </div>
                </div>
              </Show>
            </div>
          </section>

          <section class="ds-settings-section">
            <h3>{ctx.t("settings.behavior")}</h3>
            <div class="ds-settings-list" data-component="settings-list" data-variant="catalog">
              <div class="ds-settings-row" data-component="settings-row">
                <div class="ds-settings-copy" data-slot="settings-row-copy">
                  <strong>{ctx.t("settings.panel")}</strong>
                  <span>{ctx.t("settings.panel.description")}</span>
                </div>
                <div class="ds-settings-control" data-slot="settings-row-control">
                  <ui.Switch
                    checked={ctx.stores.prefs.value.panel}
                    onChange={(value) =>
                      ctx.stores.prefs.update((draft) => {
                        draft.panel = value
                      })
                    }
                    hideLabel
                    label={ctx.t("settings.panel")}
                  />
                </div>
              </div>
              <div class="ds-settings-row" data-component="settings-row">
                <div class="ds-settings-copy" data-slot="settings-row-copy">
                  <strong>{ctx.t("settings.commands")}</strong>
                  <span>{ctx.t("settings.commands.description")}</span>
                </div>
                <div class="ds-settings-control" data-slot="settings-row-control">
                  <ui.Switch
                    checked={ctx.stores.prefs.value.commands}
                    onChange={(value) =>
                      ctx.stores.prefs.update((draft) => {
                        draft.commands = value
                      })
                    }
                    hideLabel
                    label={ctx.t("settings.commands")}
                  />
                </div>
              </div>
              <div class="ds-settings-row" data-component="settings-row">
                <div class="ds-settings-copy" data-slot="settings-row-copy">
                  <strong>{ctx.t("settings.count")}</strong>
                  <span>{ctx.t("settings.count.description")}</span>
                </div>
                <div class="ds-settings-control" data-slot="settings-row-control">
                  <ui.Menu
                    label={ctx.t("settings.count.value", { count: ctx.stores.prefs.value.count })}
                    trigger="button"
                    icon="chevron-down"
                    items={[5, 8, 12, 20].map((value) => ({
                      label: String(value),
                      onSelect: () =>
                        ctx.stores.prefs.update((draft) => {
                          draft.count = value
                        }),
                    }))}
                  />
                </div>
              </div>
              <div class="ds-settings-row" data-component="settings-row">
                <div class="ds-settings-copy" data-slot="settings-row-copy">
                  <strong>{ctx.t("settings.fullText")}</strong>
                  <span>{ctx.t("settings.fullText.description")}</span>
                </div>
                <div class="ds-settings-control" data-slot="settings-row-control">
                  <ui.Switch
                    checked={ctx.stores.prefs.value.needContent}
                    onChange={(value) =>
                      ctx.stores.prefs.update((draft) => {
                        draft.needContent = value
                      })
                    }
                    hideLabel
                    label={ctx.t("settings.fullText")}
                  />
                </div>
              </div>
              <div class="ds-settings-row" data-component="settings-row">
                <div class="ds-settings-copy" data-slot="settings-row-copy">
                  <strong>{ctx.t("settings.pill")}</strong>
                  <span>{ctx.t("settings.pill.description")}</span>
                </div>
                <div class="ds-settings-control" data-slot="settings-row-control">
                  <ui.Switch
                    checked={ctx.stores.pill.value.enabled}
                    onChange={(value) =>
                      ctx.stores.pill.update((draft) => {
                        draft.enabled = value
                      })
                    }
                    hideLabel
                    label={ctx.t("settings.pill")}
                  />
                </div>
              </div>
            </div>
          </section>

          <section class="ds-settings-section ds-settings-note">
            <h3>{ctx.t("settings.usage")}</h3>
            <p>{ctx.t("settings.pricing")}</p>
            <button
              type="button"
              class="ds-settings-external-link"
              onClick={() => ctx.system.openExternal("https://platform.deepseek.com/usage")}
            >
              {ctx.t("settings.usage.open")}
            </button>
          </section>
        </div>
      </div>
    </>
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
