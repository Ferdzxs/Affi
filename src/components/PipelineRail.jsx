import { Image, FileText, Hash, Sparkles, ClipboardList, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const STAGES = [
  { key: "upload", label: "Source image", icon: Image },
  { key: "describe", label: "Describe", icon: FileText },
  { key: "hashtag", label: "Hashtags", icon: Hash },
  { key: "render", label: "Render", icon: Sparkles },
  { key: "adprompt", label: "Ad instructions", icon: ClipboardList },
]

/**
 * activeStage: "upload" | "describe" | "render" | "done" | "idle"
 */
export function PipelineRail({ activeStage = "idle" }) {
  const activeIndex = STAGES.findIndex((s) => s.key === activeStage)

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {STAGES.map((stage, i) => {
        const Icon = stage.icon
        const isDone = activeStage === "done" || (activeIndex > -1 && i < activeIndex)
        const isActive = i === activeIndex
        return (
          <div key={stage.key} className="flex items-center gap-1 sm:gap-2">
            <div className="relative flex items-center gap-1.5 sm:gap-2">
              <div
                className={cn(
                  "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors sm:h-7 sm:w-7",
                  isDone && "border-primary bg-primary text-primary-foreground",
                  isActive && !isDone && "border-primary bg-accent text-accent-foreground",
                  !isActive && !isDone && "border-border bg-muted text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {isActive && !isDone && (
                  <span className="absolute inset-0 rounded-full border border-primary animate-pulse-ring" />
                )}
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline",
                  (isActive || isDone) ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={cn("h-px w-4 sm:w-8", isDone ? "bg-primary" : "bg-border")} />
            )}
          </div>
        )
      })}
    </div>
  )
}
