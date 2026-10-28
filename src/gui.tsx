import { Plugin } from "@opencode/plugin/gui"
import { definition } from "./gui/definition.js"
import { setup } from "./gui/window.js"

export default Plugin.define({ ...definition, setup })
