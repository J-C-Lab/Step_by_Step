import { create } from 'zustand'

const STORAGE_KEY = 'step_by_step_run_history'
const MAX_HISTORY = 100

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

/** Infer a short human-readable name from code content. */
function guessName(code) {
  // 1. Top-level function assignment: var funcName = function(...)
  const fnMatch = code.match(/\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*function/)
  if (fnMatch) return fnMatch[1]

  // 2. Named function declaration
  const declMatch = code.match(/\bfunction\s+([A-Za-z_$][\w$]*)/)
  if (declMatch) return declMatch[1]

  // 3. First meaningful line comment
  const commentMatch = code.match(/\/\/\s*(.{2,40})/)
  if (commentMatch) return commentMatch[1].trim().slice(0, 28)

  // 4. Timestamp fallback
  const now = new Date()
  const mm  = String(now.getMonth() + 1).padStart(2, '0')
  const dd  = String(now.getDate()).padStart(2, '0')
  const hh  = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `算法_${mm}${dd}_${hh}${min}`
}

const useHistoryStore = create(set => ({
  items: loadFromStorage(),

  /** Add a new record; skip duplicates of the most-recent entry. */
  addRecord(code) {
    if (!code?.trim()) return
    set(state => {
      if (state.items.length > 0 && state.items[0].code === code) return state
      const item = {
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: guessName(code),
        code,
        createdAt: new Date().toISOString(),
      }
      const next = [item, ...state.items].slice(0, MAX_HISTORY)
      saveToStorage(next)
      return { items: next }
    })
  },

  renameRecord(id, name) {
    set(state => {
      const next = state.items.map(it => it.id === id ? { ...it, name: name.trim() || it.name } : it)
      saveToStorage(next)
      return { items: next }
    })
  },

  deleteRecord(id) {
    set(state => {
      const next = state.items.filter(it => it.id !== id)
      saveToStorage(next)
      return { items: next }
    })
  },
}))

export default useHistoryStore
