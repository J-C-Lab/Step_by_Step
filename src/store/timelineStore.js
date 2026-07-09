/**
 * TimelineStore (Zustand)
 *
 * Single source of truth for all execution state.
 * UI must ONLY read from here, never from InterpreterController directly.
 *
 * Status machine:
 *   idle → running → paused → running → finished → idle (reset)
 */

import { create } from 'zustand'

const useTimelineStore = create((set, get) => ({
  /** @type {Array<{step:number, line:number|null, variables:Object, callStack:string[]}>} */
  timeline: [],

  /** Index of the snapshot currently displayed in the UI */
  currentStep: 0,

  /** Execution status */
  status: 'idle', // 'idle' | 'running' | 'paused' | 'finished'
  /** Runtime diagnostics / hints shown to user */
  diagnostics: [],

  // ── Actions ──────────────────────────────────────────────

  /** Called by InterpreterController.init() — replace the whole timeline */
  resetTimeline(initial) {
    set({ timeline: [...initial], currentStep: 0, status: 'idle', diagnostics: [] })
  },

  /** Called after each interpreter.step() */
  pushSnapshot(snap) {
    set(state => ({
      timeline: [...state.timeline, snap],
      currentStep: state.timeline.length, // point to the new last item
    }))
  },

  /** Explicit status setter used by controller */
  setStatus(status) {
    set({ status })
  },

  addDiagnostic(diag) {
    if (!diag || !diag.message) return
    set(state => {
      const exists = state.diagnostics.some(d => d.message === diag.message)
      if (exists) return state
      return { diagnostics: [...state.diagnostics, diag] }
    })
  },

  clearDiagnostics() {
    set({ diagnostics: [] })
  },

  // ── Playback navigation (used by timeline scrubber / prev-next buttons) ──

  next() {
    set(state => {
      const next = Math.min(state.currentStep + 1, state.timeline.length - 1)
      return { currentStep: next }
    })
  },

  prev() {
    set(state => ({
      currentStep: Math.max(state.currentStep - 1, 0),
    }))
  },

  jump(index) {
    set(state => ({
      currentStep: Math.max(0, Math.min(index, state.timeline.length - 1)),
    }))
  },

  // ── Full reset (back to idle, clear everything) ──
  hardReset() {
    set({ timeline: [], currentStep: 0, status: 'idle', diagnostics: [] })
  },
}))

export default useTimelineStore
