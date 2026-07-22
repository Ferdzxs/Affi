import {
  GEMINI_GENERATE_URL,
  KIE_CREATE_TASK_URL,
  KIE_TASK_DETAILS_URL,
  KIE_BASE64_UPLOAD_URL,
  HASHTAG_GEMINI_MODEL,
} from "./constants"

export class ApiError extends Error {
  constructor(message, stage) {
    super(message)
    this.stage = stage
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Shared Gemini vision call - sends one text instruction plus one or more
 * images and returns the model's text response. Used by both the "describe"
 * (image -> render prompt) and "hashtag" (image -> ad hashtags) features.
 */
async function callGeminiVision({ apiKey, model, prompt, files, stage }) {
  if (!apiKey) throw new ApiError("Missing Gemini API key. Add it in Settings.", stage)
  const imageParts = await Promise.all(
    files.map(async (file) => ({
      inline_data: { mime_type: file.type || "image/png", data: await fileToBase64(file) },
    }))
  )

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
  }

  const res = await fetch(GEMINI_GENERATE_URL(model, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ApiError(`Gemini request failed (${res.status}): ${text.slice(0, 300)}`, stage)
  }

  const data = await res.json()
  const blockReason = data?.promptFeedback?.blockReason
  if (blockReason) throw new ApiError(`Gemini blocked the request (${blockReason}).`, stage)

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n")
  if (!text) throw new ApiError("Gemini returned no text. Check your API key and model name.", stage)
  return text.trim()
}

/**
 * Step 1 - turn the uploaded image(s) into a text prompt using Gemini.
 */
export async function describeImage({ apiKey, model, prompt, files }) {
  return callGeminiVision({ apiKey, model, prompt, files, stage: "describe" })
}

/**
 * Hashtag feature - looks at the ORIGINAL uploaded photo (never the generated
 * one) and writes an advertisement caption + hashtags for the product shown.
 * Always uses gemini-3.1-flash-lite regardless of the Step 1 model setting.
 */
export async function generateHashtags({ apiKey, prompt, files }) {
  return callGeminiVision({ apiKey, model: HASHTAG_GEMINI_MODEL, prompt, files, stage: "hashtags" })
}

/**
 * Fetches a remote image URL (e.g. a kie.ai render result) and wraps it as a
 * File, so it can be sent to Gemini the same way an uploaded file is. If the
 * host doesn't allow cross-origin reads of the response body, this throws -
 * there's no workaround client-side, the image bytes just aren't reachable.
 */
async function fetchWithRetry(url, attempts = 2) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`status ${res.status}`)
      return res
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

export async function urlToFile(url, fileName = "storyboard.png") {
  let res
  try {
    // The generated image lives on kie.ai's CDN. A direct browser fetch()
    // works when that CDN sends CORS headers, but many CDNs don't (an <img>
    // tag can still display the image fine either way - only fetch() cares).
    // Retry once for plain transient hiccups before giving up on this path.
    res = await fetchWithRetry(url, 2)
  } catch {
    try {
      // Fall back to our own serverless proxy (netlify/functions/fetch-image),
      // which fetches the image server-side where CORS doesn't apply, then
      // hands the bytes back to us. This is what actually fixes the
      // "Could not fetch the generated image (network error)" failure on the
      // deployed Netlify site.
      res = await fetch(`/.netlify/functions/fetch-image?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error(`proxy status ${res.status}`)
    } catch {
      throw new ApiError(
        "Could not fetch the generated image. This is usually a temporary CORS/network hiccup - press \"Try again\" on the Ad creation instructions card.",
        "adprompt"
      )
    }
  }
  const blob = await res.blob()
  return new File([blob], fileName, { type: blob.type || "image/png" })
}

/**
 * Ad-instructions feature - looks at the GENERATED storyboard image (not the
 * original upload) and asks Gemini Flash to write instructions for turning
 * it into a realistic advertisement while explicitly preserving every part
 * of the product (top/center/bottom/left/right) unchanged. Always uses
 * settings.storyboardGeminiModel. Deliberately takes no product-info text -
 * everything it needs, it reads directly from the generated image.
 */
export async function analyzeStoryboard({ apiKey, model, prompt, file }) {
  return callGeminiVision({ apiKey, model, prompt, files: [file], stage: "adprompt" })
}

/**
 * Re-encodes an arbitrary image File into a clean PNG data URL using a canvas.
 * kie.ai's createTask endpoint rejects some source encodings outright (this is
 * the actual cause of "File type not supported" - a phone photo saved as
 * WEBP/odd-profile JPEG, an unusual color space, etc. gets through the
 * browser's file picker fine but not kie.ai's validator). Round-tripping
 * through <canvas>.toDataURL("image/png") normalizes everything to a plain,
 * widely-supported PNG regardless of what the original file was.
 */
function convertFileToPng(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext("2d")
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL("image/png"))
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Could not decode image for PNG conversion"))
    }
    img.src = objectUrl
  })
}

/**
 * Uploads a base64 data URL to kie.ai's temporary file host and returns a
 * real, publicly-fetchable HTTPS URL. This is the piece that was missing:
 * createTask needs a URL it can download the image from itself, and a data:
 * URI doesn't work for that (it looks like an unsupported "file type" from
 * createTask's perspective, even though the bytes are a perfectly valid
 * image). Files uploaded here are temporary and auto-deleted by kie.ai after
 * 3 days, which is fine since we only need them for the duration of a render.
 */
async function uploadToKie({ apiKey, dataUrl, fileName }) {
  const res = await fetch(KIE_BASE64_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data: dataUrl, uploadPath: "images/uploads", fileName }),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }

  const bodyCode = data?.code
  if (!res.ok || (bodyCode !== undefined && bodyCode !== 200)) {
    const reason = data?.msg || text.slice(0, 300) || "Unknown error"
    throw new ApiError(`kie.ai file upload failed (${bodyCode ?? res.status}): ${reason}`, "render")
  }

  const url = data?.data?.downloadUrl || data?.data?.fileUrl
  if (!url) throw new ApiError("kie.ai upload did not return a file URL.", "render")
  return url
}

/**
 * Turns an uploaded File into a URL kie.ai's createTask can actually fetch.
 * Steps: normalize to PNG (fixes odd source encodings) -> upload to kie.ai's
 * temporary file host (fixes "needs a real URL, not a data: URI") -> return
 * the HTTPS URL it hands back.
 */
export async function toPublicImageUrl(file, apiKey) {
  if (!apiKey) throw new ApiError("Missing kie.ai API key. Add it in Settings.", "render")

  let pngDataUrl
  try {
    pngDataUrl = await convertFileToPng(file)
  } catch {
    const base64 = await fileToBase64(file)
    pngDataUrl = `data:${file.type || "image/png"};base64,${base64}`
  }

  const fileName = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  return uploadToKie({ apiKey, dataUrl: pngDataUrl, fileName })
}

/**
 * Step 2 - send the generated prompt + source image(s) to kie.ai to render
 * the final image, then poll until the task completes.
 */
export async function renderImage({ apiKey, kieModel, prompt, imageUrls, aspectRatio, outputFormat = "png", onStatus }) {
  if (!apiKey) throw new ApiError("Missing kie.ai API key. Add it in Settings.", "render")

  const isGptImage = kieModel.startsWith("gpt-image")
  const input = isGptImage
    ? { input_urls: imageUrls, prompt, aspect_ratio: aspectRatio, quality: "medium" }
    : { image_urls: imageUrls, prompt, aspect_ratio: aspectRatio, output_format: outputFormat }

  onStatus?.("Submitting render task...")
  const createRes = await fetch(KIE_CREATE_TASK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: kieModel, input }),
  })

  const rawText = await createRes.text()
  let createData
  try {
    createData = JSON.parse(rawText)
  } catch {
    createData = null
  }

  // kie.ai can return HTTP 200 with a body-level error code (400/401/402/404/422/
  // 429/455/500/501/505 - see their ApiResponse schema), so a 2xx HTTP status
  // alone does NOT mean the task was created. This is the actual cause of the
  // "did not return a taskId" message: the request was rejected (bad model
  // name, bad image URL, insufficient credits, etc.) and we were swallowing
  // the real reason. Surface it instead.
  const bodyCode = createData?.code
  if (!createRes.ok || (bodyCode !== undefined && bodyCode !== 200)) {
    const reason = createData?.msg || rawText.slice(0, 300) || "Unknown error"
    throw new ApiError(`kie.ai createTask failed (${bodyCode ?? createRes.status}): ${reason}`, "render")
  }

  const taskId = createData?.data?.taskId || createData?.taskId || createData?.data?.task_id
  if (!taskId) {
    throw new ApiError(
      `kie.ai did not return a taskId. Raw response: ${rawText.slice(0, 300) || "(empty)"}`,
      "render"
    )
  }

  onStatus?.("Rendering (this can take up to a minute)...")
  return pollTask({ apiKey, taskId, onStatus })
}

async function pollTask({ apiKey, taskId, onStatus, attempts = 40, intervalMs = 3000 }) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    const res = await fetch(`${KIE_TASK_DETAILS_URL}?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const text = await res.text().catch(() => "")
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
    if (!res.ok || (body?.code !== undefined && body.code !== 200)) {
      // Transient errors (rate limit, brief 5xx) - keep polling instead of failing hard.
      onStatus?.(`Rendering... (retrying after error ${body?.code ?? res.status})`)
      continue
    }

    const record = body?.data || body
    const state = (record?.state || record?.status || "").toLowerCase()

    if (state.includes("success") || state.includes("complete") || state.includes("done")) {
      let resultData = record?.resultJson
      if (typeof resultData === "string") {
        try {
          resultData = JSON.parse(resultData)
        } catch {
          resultData = null
        }
      }
      const urls =
        resultData?.resultUrls ||
        record?.resultUrls ||
        record?.result_urls ||
        record?.output?.image_urls ||
        []
      if (!urls?.length) throw new ApiError("Task finished but returned no image URLs.", "render")
      return { taskId, imageUrls: urls }
    }
    if (state.includes("fail") || state.includes("error")) {
      throw new ApiError(record?.failMsg || record?.message || "Render task failed.", "render")
    }
    onStatus?.(`Rendering... (${state || "queued"})`)
  }
  throw new ApiError("Timed out waiting for kie.ai to finish rendering.", "render")
}
