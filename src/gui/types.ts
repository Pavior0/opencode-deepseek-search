import type { SearchResult } from "../rpc.js"

export interface LastRun {
  readonly sessionKey: string
  readonly query: string
  readonly count: number
  readonly latencyMs: number
  readonly at: number
  readonly results: readonly SearchResult[]
}

export interface Seed {
  readonly key: string
  readonly query: string
  readonly oriQuestion?: string
  readonly results?: readonly SearchResult[]
  readonly latencyMs?: number
  readonly at: number
}
