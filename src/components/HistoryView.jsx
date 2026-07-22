import * as React from "react"
import JSZip from "jszip"
import { saveAs } from "file-saver"
import { Download, Trash2, Copy, ImageOff, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toaster"
import { removeHistoryItem, clearHistory } from "@/lib/storage"

export function HistoryView({ items, loading, onChange }) {
  const { toast } = useToast()
  const [zipping, setZipping] = React.useState(false)

  async function downloadAll() {
    const allUrls = items.flatMap((item) => item.outputImageUrls || [])
    if (!allUrls.length) {
      toast({ title: "Nothing to download yet", variant: "destructive" })
      return
    }
    setZipping(true)
    try {
      const zip = new JSZip()
      let ok = 0
      await Promise.all(
        allUrls.map(async (url, i) => {
          try {
            const res = await fetch(url)
            const blob = await res.blob()
            zip.file(`image-${i + 1}.png`, blob)
            ok++
          } catch {
            // skip images the browser can't fetch cross-origin
          }
        })
      )
      if (!ok) throw new Error("no images fetched")
      const content = await zip.generateAsync({ type: "blob" })
      saveAs(content, `image-prompt-studio-history-${Date.now()}.zip`)
      toast({ title: `Downloaded ${ok} of ${allUrls.length} images`, variant: "success" })
    } catch {
      toast({ title: "Couldn't build the zip", description: "Try downloading images individually instead.", variant: "destructive" })
    } finally {
      setZipping(false)
    }
  }

  async function remove(id) {
    await removeHistoryItem(id)
    onChange?.()
  }

  async function clearAll() {
    await clearHistory()
    onChange?.()
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text)
    toast({ title: "Copied to clipboard" })
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">History</h2>
          <p className="text-sm text-muted-foreground">{items.length} generation{items.length === 1 ? "" : "s"} saved on this device.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearAll} disabled={!items.length}>
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </Button>
          <Button size="sm" onClick={downloadAll} disabled={!items.length || zipping}>
            {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download all
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading history...</p>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <ImageOff className="h-6 w-6" />
          <p className="text-sm">Nothing generated yet. Run a generation to see it here.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">{new Date(item.createdAt).toLocaleString()}</CardTitle>
                  <CardDescription>{item.modelLabel}</CardDescription>
                </div>
                <Badge variant="secondary">{(item.outputImageUrls || []).length} image(s)</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {(item.outputImageUrls || []).map((url) => (
                    <img key={url} src={url} alt="generated storyboard" className="aspect-square w-full rounded-md border border-border object-cover" />
                  ))}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                  <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
                    {item.prompt || "—"}
                  </p>
                </div>

                {item.hashtags && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Hashtags</p>
                    <p className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[11px]">
                      {item.hashtags}
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Ad creation instructions</p>
                  {item.adInstructions ? (
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
                      {item.adInstructions}
                    </p>
                  ) : (
                    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      Still generating, or this entry predates the feature.
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyText(item.prompt)}>
                  <Copy className="h-3.5 w-3.5" /> Prompt
                </Button>
                {item.hashtags && (
                  <Button variant="outline" size="sm" onClick={() => copyText(item.hashtags)}>
                    <Copy className="h-3.5 w-3.5" /> Hashtags
                  </Button>
                )}
                {item.adInstructions && (
                  <Button variant="outline" size="sm" onClick={() => copyText(item.adInstructions)}>
                    <Copy className="h-3.5 w-3.5" /> Ad instructions
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
