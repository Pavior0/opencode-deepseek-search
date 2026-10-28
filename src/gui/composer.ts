import type { SessionScreen, SetupContext } from "@opencode/plugin/gui"
import type { definition } from "./definition.js"

export function insertIntoComposer(
  ctx: SetupContext<typeof definition>,
  screen: SessionScreen,
  text: string,
  label: string,
  subject: string,
) {
  const composer = screen.composer
  if (composer.quotable()) {
    composer.attach({
      type: "quote",
      commentID: crypto.randomUUID(),
      text,
      source: { label, icon: "outline-globe", subject },
    })
    composer.focus()
    return
  }
  composer.insert(`${text}\n`)
}
