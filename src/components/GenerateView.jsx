import * as React from "react"
import { Copy, Download, Wand2, Star, Loader2, RefreshCcw, Settings as SettingsIcon, Hash, ClipboardList, AlertCircle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { ImageDropzone } from "@/components/ImageDropzone"
import { PipelineRail } from "@/components/PipelineRail"
import { useSettings } from "@/context/SettingsContext"
import { useToast } from "@/components/ui/toaster"
import { RENDER_MODELS } from "@/lib/constants"
import { describeImage, generateHashtags, renderImage, toPublicImageUrl, urlToFile, analyzeStoryboard, ApiError } from "@/lib/api"
import { buildCollages } from "@/lib/collage"
import { addHistoryItem, updateHistoryItem, recordKieUploads, getKieUploadCount } from "@/lib/storage"

let uid = 0
const nextId = () => `img_${Date.now()}_${uid++}`

const IDLE_STAGE = { status: "idle", value: "", error: "" }
const IDLE_RENDER_STAGE = { status: "idle", value: [], error: "", collagesSent: 0, kieRollingTotal: null }

// Persists only the lightweight, easily-serializable parts of a generation
// session (text + remote URLs - never the original uploaded File objects,
// which can't survive a reload anyway) so results aren't lost if the OS
// reloads the page after backgrounding the PWA/tab. Tab-switching inside the
// app is handled separately (Tabs now stays mounted - see ui/tabs.jsx) and
// never touches this at all.
const SESSION_KEY = "ips.generateSession.v1"

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(data) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {
    // ignore quota / serialization failures - this is a best-effort convenience
  }
}

// Uploaded photos are split into this many groups, each rendered into its
// own collage, so the model gets several distinct reference images instead
// of one giant grid.
const COLLAGE_GROUP_COUNT = 2

function messageFromError(err, fallback) {
  return err instanceof ApiError ? err.message : fallback
}

export function GenerateView({ onNavigateSettings, onHistoryChange }) {
  const { settings, update, persist, ready } = useSettings()
  const { toast } = useToast()

  const [images, setImages] = React.useState([])
  const [modelId, setModelId] = React.useState(settings.defaultRenderModel || "gpt-image")
  const [statusText, setStatusText] = React.useState("")

  // Each output the pipeline can produce is tracked independently so a retry
  // on one never touches the others, and the main Generate button can tell
  // which pieces still need to run.
  const [promptStage, setPromptStage] = React.useState(() => loadSession()?.promptStage ?? IDLE_STAGE)
  const [hashtagStage, setHashtagStage] = React.useState(() => loadSession()?.hashtagStage ?? IDLE_STAGE)
  const [renderStage, setRenderStage] = React.useState(() => loadSession()?.renderStage ?? IDLE_RENDER_STAGE)
  const [adPromptStage, setAdPromptStage] = React.useState(() => loadSession()?.adPromptStage ?? IDLE_STAGE)

  // Keep the session snapshot in sync with the pieces that are cheap and
  // safe to restore after a reload. Uploaded source images are deliberately
  // excluded - only their remote-hosted outputs (URLs) and generated text
  // are worth persisting.
  React.useEffect(() => {
    saveSession({ promptStage, hashtagStage, renderStage, adPromptStage })
  }, [promptStage, hashtagStage, renderStage, adPromptStage])

  // The collages are what actually get uploaded to kie.ai and used as the
  // generation reference - the original uploaded photos never are. Uploaded
  // photos are split into COLLAGE_GROUP_COUNT groups, each merged into its
  // own collage File. Keeping the built files / uploaded URLs in refs (not
  // just state) lets performRender reuse them across "Try again" clicks
  // instead of rebuilding and re-uploading every time, which is what was
  // burning through kie.ai's 30-uploads-per-30-days free quota.
  const [collagePreviewUrls, setCollagePreviewUrls] = React.useState([])
  const [collageBuilding, setCollageBuilding] = React.useState(false)
  const collageFilesRef = React.useRef([])
  const collageUploadedUrlsRef = React.useRef([])
  const collagePreviewObjectUrlsRef = React.useRef([])

  function revokeCollagePreviews() {
    collagePreviewObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    collagePreviewObjectUrlsRef.current = []
  }

  // Rebuild the collages (and invalidate any cached kie.ai uploads for them)
  // whenever the set of source images changes.
  React.useEffect(() => {
    collageFilesRef.current = []
    collageUploadedUrlsRef.current = []

    if (!images.length) {
      revokeCollagePreviews()
      setCollagePreviewUrls([])
      return
    }

    let cancelled = false
    setCollageBuilding(true)
    buildCollages(images.map((i) => i.file), COLLAGE_GROUP_COUNT)
      .then((files) => {
        if (cancelled) return
        collageFilesRef.current = files
        revokeCollagePreviews()
        const previewUrls = files.map((f) => URL.createObjectURL(f))
        collagePreviewObjectUrlsRef.current = previewUrls
        setCollagePreviewUrls(previewUrls)
      })
      .catch((err) => {
        console.error("Failed to build reference collage(s)", err)
        if (!cancelled) toast({ title: "Couldn't build the reference collage", description: err.message, variant: "destructive" })
      })
      .finally(() => {
        if (!cancelled) setCollageBuilding(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images])

  // Revoke collage preview object URLs when the component unmounts.
  React.useEffect(() => {
    return () => revokeCollagePreviews()
  }, [])

  const model = RENDER_MODELS[modelId]
  const anyRunning =
    promptStage.status === "running" ||
    hashtagStage.status === "running" ||
    renderStage.status === "running" ||
    adPromptStage.status === "running"

  function addImages(files) {
    const items = files.map((file) => ({ id: nextId(), file, previewUrl: URL.createObjectURL(file) }))
    setImages((prev) => [...prev, ...items].slice(0, model.maxImages))
  }

  function removeImage(id) {
    setImages((prev) => prev.filter((i) => i.id !== id))
  }

  function setDefaultModel(id) {
    update({ defaultRenderModel: id })
    persist()
    toast({ title: "Default model updated", description: `${RENDER_MODELS[id].label} will be pre-selected next time.` })
  }

  function resetOutputs() {
    setPromptStage(IDLE_STAGE)
    setHashtagStage(IDLE_STAGE)
    setRenderStage(IDLE_RENDER_STAGE)
    setAdPromptStage(IDLE_STAGE)
    setStatusText("")
  }

  // --- Independent stage runners -------------------------------------------------

  async function performDescribe() {
    setPromptStage((s) => ({ ...s, status: "running", error: "" }))
    try {
      const files = images.map((i) => i.file)
      const text = await describeImage({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        prompt: settings.describePrompt,
        files,
      })
      setPromptStage({ status: "done", value: text, error: "" })
      return text
    } catch (err) {
      const message = messageFromError(err, "Something went wrong describing the image.")
      setPromptStage((s) => ({ ...s, status: "error", error: message }))
      toast({ title: "Prompt generation failed", description: message, variant: "destructive" })
      return null
    }
  }

  async function performHashtags() {
    setHashtagStage((s) => ({ ...s, status: "running", error: "" }))
    try {
      const files = images.map((i) => i.file)
      const text = await generateHashtags({
        apiKey: settings.geminiApiKey,
        prompt: settings.hashtagPrompt,
        files,
      })
      setHashtagStage({ status: "done", value: text, error: "" })
      return text
    } catch (err) {
      const message = messageFromError(err, "Something went wrong generating hashtags.")
      setHashtagStage((s) => ({ ...s, status: "error", error: message }))
      toast({ title: "Hashtag generation failed", description: message, variant: "destructive" })
      return null
    }
  }

  async function performRender(promptTextOverride) {
    const promptText = (promptTextOverride ?? promptStage.value)?.trim()
    if (!promptText) {
      toast({ title: "Nothing to render yet", description: "Generate a prompt first.", variant: "destructive" })
      return null
    }
    setRenderStage((s) => ({ ...s, status: "running", error: "" }))
    try {
      // Only the collages are ever uploaded to kie.ai / sent for generation -
      // the individual originals are used locally for Gemini and nothing
      // else. Both the built files and their kie.ai URLs are cached in refs,
      // so hitting "Try again" reuses them instead of uploading again.
      let collageFiles = collageFilesRef.current
      if (!collageFiles.length) {
        setStatusText("Building reference collages...")
        collageFiles = await buildCollages(images.map((i) => i.file), COLLAGE_GROUP_COUNT)
        collageFilesRef.current = collageFiles
      }

      let uploadedUrls = collageUploadedUrlsRef.current
      let freshUploads = 0
      if (uploadedUrls.length !== collageFiles.length) {
        setStatusText(
          `Uploading ${collageFiles.length} reference collage${collageFiles.length > 1 ? "s" : ""} to kie.ai...`
        )
        uploadedUrls = await Promise.all(collageFiles.map((f) => toPublicImageUrl(f, settings.kieApiKey)))
        collageUploadedUrlsRef.current = uploadedUrls
        freshUploads = uploadedUrls.length
      }
      const kieRollingTotal = freshUploads > 0 ? recordKieUploads(freshUploads) : null

      const imageUrls = uploadedUrls
      const finalPrompt = settings.renderPrompt.replace("{generatedPrompt}", promptText)

      const { imageUrls: outputUrls } = await renderImage({
        apiKey: settings.kieApiKey,
        kieModel: model.kieModel,
        prompt: finalPrompt,
        imageUrls,
        aspectRatio: "1:1",
        onStatus: setStatusText,
      })

      setRenderStage({
        status: "done",
        value: outputUrls,
        error: "",
        collagesSent: collageFiles.length,
        kieRollingTotal: kieRollingTotal ?? getKieUploadCount(),
      })
      setStatusText("Done")

      // Auto-download every generated image as soon as it's ready, so it's
      // saved locally without an extra click.
      outputUrls.forEach((url, idx) => downloadImage(url, idx))

      const historyId = nextId()
      await addHistoryItem({
        id: historyId,
        createdAt: Date.now(),
        modelId,
        modelLabel: model.label,
        prompt: promptText,
        finalPrompt,
        hashtags: hashtagStage.status === "done" ? hashtagStage.value : "",
        adInstructions: "",
        inputThumbnails: images.slice(0, 3).map((i) => i.previewUrl),
        outputImageUrls: outputUrls,
        collagesSent: collageFiles.length,
      })
      onHistoryChange?.()

      // Ad instructions are generated right after the image, from that same
      // image - once ready, patch them into the history entry that was just
      // saved so History shows prompt + hashtags + storyboard + ad
      // instructions together, not just the first three.
      performAdPrompt(outputUrls[0]).then((adText) => {
        if (adText) {
          updateHistoryItem(historyId, { adInstructions: adText }).then(() => onHistoryChange?.())
        }
      })
      return outputUrls
    } catch (err) {
      const message = messageFromError(err, "Something went wrong rendering the image.")
      setRenderStage((s) => ({ ...s, status: "error", error: message }))
      setStatusText("")
      toast({ title: "Render failed", description: message, variant: "destructive" })
      return null
    }
  }

  async function performAdPrompt(imageUrl) {
    const sourceUrl = imageUrl ?? renderStage.value[0]
    if (!sourceUrl) {
      toast({ title: "Nothing to analyze yet", description: "Render an image first.", variant: "destructive" })
      return null
    }
    setAdPromptStage((s) => ({ ...s, status: "running", error: "" }))
    try {
      const file = await urlToFile(sourceUrl, "storyboard.png")
      const text = await analyzeStoryboard({
        apiKey: settings.geminiApiKey,
        model: settings.storyboardGeminiModel,
        prompt: settings.adPrompt,
        file,
      })
      setAdPromptStage({ status: "done", value: text, error: "" })
      return text
    } catch (err) {
      const message = messageFromError(err, "Something went wrong analyzing the storyboard.")
      setAdPromptStage((s) => ({ ...s, status: "error", error: message }))
      toast({ title: "Ad-instructions generation failed", description: message, variant: "destructive" })
      return null
    }
  }

  // Main Generate button: only runs the pieces that haven't succeeded yet.
  // Anything already generated (prompt, hashtags, or image) is left untouched.
  async function runPipeline() {
    if (!images.length || anyRunning) return
    try {
      const describeTask =
        promptStage.status === "done" ? Promise.resolve(promptStage.value) : performDescribe()
      const hashtagTask =
        hashtagStage.status === "done" ? Promise.resolve(hashtagStage.value) : performHashtags()

      const [promptText] = await Promise.all([describeTask, hashtagTask])

      if (renderStage.status !== "done") {
        const textForRender = promptText || promptStage.value
        if (textForRender) await performRender(textForRender)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text)
    toast({ title: "Copied to clipboard" })
  }

  async function downloadImage(url, index = 0) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `generated-${Date.now()}-${index}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      // Falls back to opening the URL directly if the host blocks cross-origin fetches.
      window.open(url, "_blank")
    }
  }

  const activeStage = promptStage.status === "running"
    ? "describe"
    : hashtagStage.status === "running"
    ? "hashtag"
    : renderStage.status === "running"
    ? "render"
    : adPromptStage.status === "running"
    ? "adprompt"
    : promptStage.status === "done" && hashtagStage.status === "done" && renderStage.status === "done" && adPromptStage.status === "done"
    ? "done"
    : "idle"

  const hasAnyOutput = promptStage.value || hashtagStage.value || renderStage.value.length > 0 || adPromptStage.value

  if (!ready) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle>Finish setup first</CardTitle>
          <CardDescription>
            Add your Gemini and kie.ai API keys, plus the prompts, in Settings before you can generate.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button onClick={onNavigateSettings}>
            <SettingsIcon className="h-4 w-4" /> Go to Settings
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Generate</h2>
          <p className="text-sm text-muted-foreground">Upload a photo, describe it, then render a new one.</p>
        </div>
        <PipelineRail activeStage={activeStage} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Choose your render model</CardTitle>
          <CardDescription>Sets how many source images you can upload and which kie.ai model runs the render step.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={modelId}
            onValueChange={(v) => {
              setModelId(v)
              setImages((prev) => prev.slice(0, RENDER_MODELS[v].maxImages))
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {Object.values(RENDER_MODELS).map((m) => (
              <label
                key={m.id}
                htmlFor={m.id}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${
                  modelId === m.id ? "border-primary bg-accent" : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={m.id} id={m.id} />
                    <span className="font-medium">{m.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setDefaultModel(m.id)
                    }}
                    title="Set as default"
                    className="text-muted-foreground hover:text-amber"
                  >
                    <Star className={`h-4 w-4 ${settings.defaultRenderModel === m.id ? "fill-amber text-amber" : ""}`} />
                  </button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{m.subtitle}</p>
                <Badge variant="secondary" className="w-fit">Up to {m.maxImages} images</Badge>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Upload source image(s)</CardTitle>
          <CardDescription>
            {images.length} of {model.maxImages} used for {model.label}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImageDropzone
            images={images}
            onAdd={(files) => {
              addImages(files)
              resetOutputs()
            }}
            onRemove={(id) => {
              removeImage(id)
              resetOutputs()
            }}
            maxImages={model.maxImages}
            disabled={anyRunning}
          />

          {images.length > 1 && (
            <div className="mt-4 space-y-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Reference collages - your {images.length} photos, split into {Math.max(collagePreviewUrls.length, 1)}{" "}
                group{collagePreviewUrls.length > 1 ? "s" : ""}, one collage built per group
              </p>
              {collageBuilding && !collagePreviewUrls.length ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building collages...
                </p>
              ) : collagePreviewUrls.length ? (
                <div className={`grid gap-3 ${collagePreviewUrls.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {collagePreviewUrls.map((url, idx) => (
                    <div key={url} className="space-y-1">
                      {collagePreviewUrls.length > 1 && (
                        <p className="text-xs text-muted-foreground">Group {idx + 1}</p>
                      )}
                      <img
                        src={url}
                        alt={`Reference collage ${idx + 1}`}
                        className="max-h-56 w-full rounded-md border border-border object-contain"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Only these composites are uploaded to kie.ai and used as the generation reference - your original
                photos are never uploaded there (they're only sent locally to Gemini for the prompt/hashtag steps).
                That keeps every batch to {collagePreviewUrls.length || 1} kie.ai upload
                {(collagePreviewUrls.length || 1) > 1 ? "s" : ""}, no matter how many photos you add.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Run the pipeline</CardTitle>
          <CardDescription>
            {statusText ||
              "Generates the render prompt, the product hashtags, the new image, and its ad-creation instructions. Anything already generated is left alone."}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button size="lg" disabled={!images.length || anyRunning} onClick={runPipeline}>
            {anyRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {anyRunning ? "Generating..." : "Generate"}
          </Button>
        </CardFooter>
      </Card>

      {hasAnyOutput && (
        <>
          <Separator />

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Generated prompt</CardTitle>
                <CardDescription>From Gemini — feel free to edit it before rendering.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                {promptStage.value && (
                  <Button variant="outline" size="sm" onClick={() => copyText(promptStage.value)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={performDescribe}
                  disabled={!images.length || promptStage.status === "running"}
                  title="Regenerate just the prompt"
                >
                  {promptStage.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  Try again
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {promptStage.status === "running" && !promptStage.value ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Describing your image with Gemini...
                </p>
              ) : (
                <Textarea
                  value={promptStage.value}
                  onChange={(e) => setPromptStage((s) => ({ ...s, value: e.target.value }))}
                  className="min-h-28 font-mono text-xs"
                  placeholder="Nothing generated yet."
                />
              )}
              {promptStage.error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {promptStage.error}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5"><Hash className="h-4 w-4" /> Advertisement hashtags</CardTitle>
                <CardDescription>From the original uploaded photo, via gemini-3.1-flash-lite.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                {hashtagStage.value && (
                  <Button variant="outline" size="sm" onClick={() => copyText(hashtagStage.value)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={performHashtags}
                  disabled={!images.length || hashtagStage.status === "running"}
                  title="Regenerate just the hashtags"
                >
                  {hashtagStage.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  Try again
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {hashtagStage.status === "running" && !hashtagStage.value ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking at your product photo...
                </p>
              ) : hashtagStage.value ? (
                <Textarea
                  value={hashtagStage.value}
                  onChange={(e) => setHashtagStage((s) => ({ ...s, value: e.target.value }))}
                  className="min-h-20 font-mono text-xs"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Nothing generated yet.</p>
              )}
              {hashtagStage.error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {hashtagStage.error}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Generated image</CardTitle>
                <CardDescription>Rendered by {model.label}.</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="sm:shrink-0"
                onClick={() => performRender()}
                disabled={!promptStage.value || renderStage.status === "running"}
                title="Regenerate just the image"
              >
                {renderStage.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Try again
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {renderStage.status === "done" && renderStage.collagesSent > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sent {renderStage.collagesSent} collage{renderStage.collagesSent > 1 ? "s" : ""} to kie.ai for this
                  render
                  {renderStage.kieRollingTotal != null && ` — ${renderStage.kieRollingTotal} kie.ai uploads in the last 30 days`}
                  .
                </p>
              )}
              {renderStage.status === "running" && !renderStage.value.length ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {statusText || "Rendering..."}
                </p>
              ) : renderStage.value.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderStage.value.map((url, idx) => (
                    <div key={url} className="space-y-2">
                      <div className="overflow-hidden rounded-lg border border-border">
                        <img src={url} alt={`Result ${idx + 1}`} className="w-full object-cover" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => copyText(url)}>
                          <Copy className="h-3.5 w-3.5" /> Copy link
                        </Button>
                        <Button size="sm" className="flex-1" onClick={() => downloadImage(url, idx)}>
                          <Download className="h-3.5 w-3.5" /> Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing generated yet.</p>
              )}
              {renderStage.error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {renderStage.error}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5"><ClipboardList className="h-4 w-4" /> Ad creation instructions</CardTitle>
                <CardDescription>
                  From Gemini Flash, analyzing the generated storyboard above — tells an image editor how to make it a
                  realistic ad while keeping the product's top, center, bottom, left, and right unchanged.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                {adPromptStage.value && (
                  <Button variant="outline" size="sm" onClick={() => copyText(adPromptStage.value)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => performAdPrompt()}
                  disabled={!renderStage.value.length || adPromptStage.status === "running"}
                  title="Regenerate just the ad instructions"
                >
                  {adPromptStage.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  Try again
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {adPromptStage.status === "running" && !adPromptStage.value ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing the storyboard with Gemini...
                </p>
              ) : adPromptStage.value ? (
                <Textarea
                  value={adPromptStage.value}
                  onChange={(e) => setAdPromptStage((s) => ({ ...s, value: e.target.value }))}
                  className="min-h-32 font-mono text-xs"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {renderStage.value.length ? "Nothing generated yet." : "Render an image first."}
                </p>
              )}
              {adPromptStage.error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {adPromptStage.error}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
