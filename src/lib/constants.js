// Storage keys used across localStorage / IndexedDB
export const STORAGE_KEYS = {
  settings: "ips.settings.v1",
  history: "ips.history.v1",
}

// The two render models exposed through kie.ai, with their real input limits
export const RENDER_MODELS = {
  "gpt-image": {
    id: "gpt-image",
    label: "GPT Image 1.5",
    subtitle: "gpt-image/1.5-image-to-image",
    kieModel: "gpt-image/1.5-image-to-image",
    maxImages: 16,
    aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
  },
  "nano-banana": {
    id: "nano-banana",
    label: "Nano Banana (Gemini 3)",
    subtitle: "google/nano-banana-edit",
    kieModel: "google/nano-banana-edit",
    maxImages: 10,
    aspectRatios: ["1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9", "auto"],
  },
}

// Editable default prompts for each transforming step
export const DEFAULT_PROMPTS = {
  describe:
    "Look closely at the uploaded photo. Write one dense, vivid image-generation prompt (120-200 words) that fully describes the subject's likeness, pose, expression, outfit, lighting, color palette, and background so it could be redrawn from scratch. Be specific and literal, not poetic. Do not add a preamble, title, or commentary - respond with the prompt text only.",
  render:
    "Edit the image following this description precisely: {generatedPrompt}\n\nPreserve the subject's exact likeness, proportions, and pose unless the description says otherwise. Keep lighting, shadows, and color temperature consistent so the result looks photorealistic and not pasted together.",
  hashtag:
    "Look closely at the uploaded photo and identify the main product(s) shown. Write a short advertisement-style caption (1 sentence) followed by 12-18 relevant, high-traffic marketing hashtags for promoting that product on social media. Mix broad hashtags (e.g. #shopnow) with specific ones about the product's category, brand-style, and use case. Respond with the caption on the first line, then the hashtags separated by spaces on the next line. Do not add any other commentary.",
  adInstruction:
    "You are looking at a generated storyboard image for a product advertisement. Study it carefully, section by section - top, center, bottom, left, and right - and note the product's exact shape, proportions, materials, colors, textures, and any visible text or logos in each area.\n\nWrite clear, step-by-step instructions for an image-editing AI to turn this storyboard into a realistic, professional advertisement photo: photorealistic lighting, a believable environment/background, natural shadows, reflections, and depth of field appropriate for an ad. The instructions must explicitly require that every detailed part of the product identified above - top, center, bottom, left, and right - stays completely unchanged: same shape, proportions, colors, materials, textures, text, and logos, with zero distortion or reinterpretation. Only the surrounding scene, lighting, and photographic quality should change. Respond with the instructions only, no preamble or commentary.",
}

// Dedicated Gemini Flash model for the "generated storyboard -> ad-creation
// instructions" feature (analyzes the rendered image, not the original
// upload). Editable in Settings in case Google renames/versions it.
export const DEFAULT_STORYBOARD_GEMINI_MODEL = "gemini-3.5-flash"

// Dedicated model for the "uploaded photo -> product hashtags" feature. This is
// intentionally independent from the Step 1 describe model (settings.geminiModel)
// since this feature always targets gemini-3.1-flash-lite per product requirements.
export const HASHTAG_GEMINI_MODEL = "gemini-3.1-flash-lite"

export const DEFAULT_SETTINGS = {
  geminiApiKey: "",
  kieApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  describePrompt: DEFAULT_PROMPTS.describe,
  renderPrompt: DEFAULT_PROMPTS.render,
  hashtagPrompt: DEFAULT_PROMPTS.hashtag,
  adPrompt: DEFAULT_PROMPTS.adInstruction,
  storyboardGeminiModel: DEFAULT_STORYBOARD_GEMINI_MODEL,
  defaultRenderModel: "gpt-image",
}

export const KIE_CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask"
// kie.ai's docs reference a "Get Task Details" endpoint for polling; confirm the exact
// path against your kie.ai dashboard/docs if it differs in your account.
export const KIE_TASK_DETAILS_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

// createTask requires a real, publicly-fetchable image URL - it will NOT accept
// a data: URI (that's the actual cause of "File type not supported" errors).
// kie.ai's own temporary file host takes base64 data and hands back a real
// HTTPS URL we can then pass into image_urls/input_urls. Uploaded files are
// auto-deleted by kie.ai after 3 days.
export const KIE_BASE64_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload"

export const GEMINI_GENERATE_URL = (model, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
