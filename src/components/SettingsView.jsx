import * as React from "react"
import { Eye, EyeOff, RotateCcw, Save, ShieldCheck, AlertTriangle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useSettings } from "@/context/SettingsContext"
import { useToast } from "@/components/ui/toaster"
import { DEFAULT_PROMPTS } from "@/lib/constants"
import { getKieUploadCount } from "@/lib/storage"

function SecretInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = React.useState(false)
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-9 font-mono text-xs"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export function SettingsView() {
  const { settings, update, persist, dirty, ready } = useSettings()
  const { toast } = useToast()
  const [kieUploadCount, setKieUploadCount] = React.useState(0)

  React.useEffect(() => {
    setKieUploadCount(getKieUploadCount())
  }, [])

  function handleSave() {
    persist()
    toast({ title: "Settings saved", description: "Your keys and prompts are stored on this device.", variant: "success" })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold">Settings</h2>
          {ready ? (
            <Badge variant="success"><ShieldCheck className="h-3 w-3" /> Ready to generate</Badge>
          ) : (
            <Badge variant="destructive"><AlertTriangle className="h-3 w-3" /> Setup incomplete</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Both API keys and both prompts are required before the Generate tab unlocks. Everything here is saved only
          on this device (localStorage) — nothing is sent anywhere except the API calls you trigger yourself.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>kie.ai upload quota (estimated)</CardTitle>
          <CardDescription>
            Tracked locally on this device only — kie.ai's own count is authoritative, this just helps you avoid
            surprises before hitting their free-tier cap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={kieUploadCount >= 27 ? "destructive" : kieUploadCount >= 20 ? "amber" : "success"}>
              {kieUploadCount} upload{kieUploadCount === 1 ? "" : "s"} in the last 30 days
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Used directly from your browser to call Gemini and kie.ai.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SecretInput
            label="Gemini API key"
            value={settings.geminiApiKey}
            onChange={(v) => update({ geminiApiKey: v })}
            placeholder="AIza..."
          />
          <SecretInput
            label="kie.ai API key"
            value={settings.kieApiKey}
            onChange={(v) => update({ kieApiKey: v })}
            placeholder="Bearer token"
          />
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Gemini model name</Label>
            <Input
              value={settings.geminiModel}
              onChange={(e) => update({ geminiModel: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Editable in case Google renames or versions the model you want to use for step 1.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 1 prompt — Image → Prompt</CardTitle>
            <CardDescription>Sent to Gemini together with your uploaded image(s).</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ describePrompt: DEFAULT_PROMPTS.describe })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            value={settings.describePrompt}
            onChange={(e) => update({ describePrompt: e.target.value })}
            className="min-h-32 font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 2 prompt — Prompt → Image</CardTitle>
            <CardDescription>
              Sent to your chosen render model. Use <code className="rounded bg-muted px-1 py-0.5">{"{generatedPrompt}"}</code> to
              insert the text Gemini produced in step 1.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ renderPrompt: DEFAULT_PROMPTS.render })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            value={settings.renderPrompt}
            onChange={(e) => update({ renderPrompt: e.target.value })}
            className="min-h-32 font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 3 prompt — Photo → Hashtags</CardTitle>
            <CardDescription>
              Sent to <code className="rounded bg-muted px-1 py-0.5">gemini-3.1-flash-lite</code> together with your
              original uploaded photo, to write an ad caption and hashtags for the product shown.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ hashtagPrompt: DEFAULT_PROMPTS.hashtag })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            value={settings.hashtagPrompt}
            onChange={(e) => update({ hashtagPrompt: e.target.value })}
            className="min-h-32 font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Step 4 prompt — Storyboard → Ad instructions</CardTitle>
            <CardDescription>
              Sent to Gemini Flash together with the <em>generated</em> storyboard image, to write instructions for
              turning it into a realistic ad while keeping the product unchanged. Runs automatically as soon as the
              image finishes rendering.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ adPrompt: DEFAULT_PROMPTS.adInstruction })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={settings.adPrompt}
            onChange={(e) => update({ adPrompt: e.target.value })}
            className="min-h-32 font-mono text-xs"
          />
          <div className="space-y-1.5">
            <Label>Gemini Flash model name</Label>
            <Input
              value={settings.storyboardGeminiModel}
              onChange={(e) => update({ storyboardGeminiModel: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Editable in case Google renames or versions the Flash model you want to use for this step.
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">
          {dirty ? "You have unsaved changes." : "Everything is saved."}
        </p>
        <Button onClick={handleSave} disabled={!dirty}>
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </div>
    </div>
  )
}
