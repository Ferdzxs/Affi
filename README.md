# Image Prompt Studio

A PWA that turns a photo into a text prompt (Gemini) and then renders a new
image from that prompt (kie.ai's `gpt-image/1.5-image-to-image` or
`google/nano-banana-edit`).

## Run it

```bash
npm install
npm run dev       # dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build locally
```

Deploy the contents of `dist/` to any static host (Vercel, Netlify, Cloudflare
Pages, GitHub Pages, S3, etc). It's a standard Vite + React app, so nothing
server-side is required — all API calls happen from the browser using the keys
you enter in **Settings**.

## Using the app

1. Open **Settings** and fill in:
   - Gemini API key + model name (defaults to `gemini-3.1-flash-lite` —
     editable if Google renames/versions it)
   - kie.ai API key
   - The two prompts (step 1: image → prompt, step 2: prompt → image)
   - Click **Save settings**. The Generate tab stays locked until all four
     fields are filled in.
2. Go to **Generate**, pick a render model (GPT Image 1.5 allows up to 16
   source images, Nano Banana up to 10 — the star icon sets your default),
   upload photo(s), and click **Generate**.
3. Copy/download the generated prompt and image. Every successful run is
   saved to **History**, where you can download everything as a zip with
   **Download all**.

Settings are saved in `localStorage`; history (including images) is saved in
IndexedDB, both scoped to your browser on this device only.

## Important implementation notes / things to verify against your kie.ai account

- **Image hosting for kie.ai (`toPublicImageUrl` in `src/lib/api.js`)** —
  kie.ai's `createTask` endpoint expects publicly reachable image URLs, not
  raw file uploads. This app currently sends the uploaded image as a base64
  `data:` URL, which works with some providers for quick testing but is not
  guaranteed to work with kie.ai's fetcher and will make requests large. For
  production, replace `toPublicImageUrl()` with a real upload step (e.g. to
  S3, Cloudinary, Supabase Storage, or whatever upload endpoint kie.ai
  provides in your dashboard) that returns a public URL.
- **Polling endpoint (`KIE_TASK_DETAILS_URL` in `src/lib/constants.js`)** —
  the pasted API docs mention a "Get Task Details" endpoint for polling but
  didn't include its exact path. This app guesses
  `https://api.kie.ai/api/v1/jobs/recordInfo`; confirm the real path/response
  shape in your kie.ai dashboard and update the constant (and the response
  parsing in `pollTask()` inside `src/lib/api.js`) if it differs.
- **Gemini model name** — `gemini-3.1-flash-lite` is what you specified; it's
  exposed as an editable field in Settings so you can correct it if Google's
  actual model id is different.
- **CORS** — both Gemini's API and kie.ai's API need to allow browser-side
  requests with your API key in the request. If either blocks direct browser
  calls, you'll need a small proxy server to forward the requests server-side
  (keeping keys out of client code is also generally safer for anything
  beyond personal/local use).

## Structure

```
src/
  components/ui/       shadcn-style primitives (button, card, tabs, dialog, ...)
  components/          PipelineRail, ImageDropzone, SettingsView, GenerateView, HistoryView
  context/             SettingsContext (localStorage-backed)
  lib/                 constants, storage (localStorage + IndexedDB), api client
public/
  manifest.webmanifest, sw.js, icons   PWA install support
```
