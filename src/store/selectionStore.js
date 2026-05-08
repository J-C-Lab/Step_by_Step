import { create } from 'zustand'

const useSelectionStore = create(set => ({
  selectedVariable: null,

  setSelectedVariable(name) {
    set({ selectedVariable: name || null })
  },

  clearSelectedVariable() {
    set({ selectedVariable: null })
  },
}))

export default useSelectionStore
