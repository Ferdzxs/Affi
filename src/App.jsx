import * as React from "react"
import { Sparkles, History, Settings as SettingsIcon, Moon, Sun } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SettingsProvider, useSettings } from "@/context/SettingsContext"
import { ThemeProvider, useTheme } from "@/context/ThemeContext"
import { ToastProvider } from "@/components/ui/toaster"
import { SettingsView } from "@/components/SettingsView"
import { GenerateView } from "@/components/GenerateView"
import { HistoryView } from "@/components/HistoryView"
import { listHistory } from "@/lib/storage"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

function TopBar() {
  const { ready } = useSettings()
  const { isDark, toggleTheme } = useTheme()
  return (
    <header className="border-b border-border bg-card/60 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="logo-glow flex h-9 w-9 items-center justify-center rounded-xl text-white">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <h1 className="font-display text-lg font-extrabold leading-none tracking-tight">
            Image Prompt Studio
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!ready && <Badge variant="destructive" className="hidden sm:flex">Setup needed</Badge>}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Sun className="h-3.5 w-3.5" />
            <Switch checked={isDark} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
            <Moon className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </header>
  )
}

function Shell() {
  const [tab, setTab] = React.useState("generate")
  const [history, setHistory] = React.useState([])
  const [historyLoading, setHistoryLoading] = React.useState(true)

  const refreshHistory = React.useCallback(async () => {
    setHistoryLoading(true)
    const items = await listHistory()
    setHistory(items)
    setHistoryLoading(false)
  }, [])

  React.useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="generate"><Sparkles className="h-3.5 w-3.5" /> Generate</TabsTrigger>
            <TabsTrigger value="history"><History className="h-3.5 w-3.5" /> History</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="h-3.5 w-3.5" /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <GenerateView onNavigateSettings={() => setTab("settings")} onHistoryChange={refreshHistory} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryView items={history} loading={historyLoading} onChange={refreshHistory} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsView />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}
