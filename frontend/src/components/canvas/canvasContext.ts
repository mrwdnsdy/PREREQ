import { createContext, useContext } from 'react'

// Actions the custom nodes need but that live on the canvas (collapse state,
// rename). Passed via context so buildFlow() can stay a pure data transform.
export interface CanvasActions {
  collapsed: Set<string>
  toggleCollapse: (id: string) => void
  rename: (id: string, name: string) => void
}

export const CanvasActionsContext = createContext<CanvasActions>({
  collapsed: new Set(),
  toggleCollapse: () => {},
  rename: () => {},
})

export const useCanvasActions = () => useContext(CanvasActionsContext)
