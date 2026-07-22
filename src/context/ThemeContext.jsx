import * as React from "react"

const THEME_KEY = "ips.theme.v1"
const ThemeContext = React.createContext(null)

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // localStorage unavailable - fall through to default
  }
  // Dark mode is the default for this app, regardless of system preference.
  return "dark"
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = React.useState(getInitialTheme)

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore write failures (private browsing, storage full, etc.)
    }
  }, [theme])

  const value = React.useMemo(
    () => ({
      theme,
      isDark: theme === "dark",
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      setTheme,
    }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
