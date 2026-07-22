import * as React from "react"
import { UploadCloud, X, ImagePlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function ImageDropzone({ images, onAdd, onRemove, maxImages, disabled }) {
  const inputRef = React.useRef(null)
  const [dragOver, setDragOver] = React.useState(false)
  const remaining = maxImages - images.length

  function handleFiles(fileList) {
    if (disabled) return
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
    if (!files.length) return
    onAdd(files.slice(0, remaining))
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && remaining > 0) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => remaining > 0 && !disabled && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          remaining > 0 && !disabled ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed opacity-60",
          dragOver ? "border-primary bg-accent" : "border-border"
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {remaining > 0 ? "Drop images here or click to browse" : "Image limit reached"}
        </p>
        <p className="text-xs text-muted-foreground">
          {images.length} / {maxImages} images &middot; PNG, JPEG, WEBP up to 10MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
              <img src={img.previewUrl} alt={img.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(img.id)
                }}
                disabled={disabled}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0"
                aria-label={`Remove ${img.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
