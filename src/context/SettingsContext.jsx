import * as React from "react"
import { loadSettings, saveSettings, isSetupComplete } from "@/lib/storage"

const SettingsContext = React.createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = React.useState(loadSettings)
  const [dirty, setDirty] = React.useState(false)

  const update = React.useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }, [])

  const persist = React.useCallback(() => {
    saveSettings(settings)
    setDirty(false)
  }, [settings])

  const value = React.useMemo(
    () => ({
      settings,
      update,
      persist,
      dirty,
      ready: isSetupComplete(settings),
    }),
    [settings, update, persist, dirty]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = React.useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}
