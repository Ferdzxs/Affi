import { get, set, del } from "idb-keyval"
import { STORAGE_KEYS, DEFAULT_SETTINGS } from "./constants"

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}

export function isSetupComplete(settings) {
  return Boolean(
    settings.geminiApiKey?.trim() &&
      settings.kieApiKey?.trim() &&
      settings.describePrompt?.trim() &&
      settings.renderPrompt?.trim()
  )
}

// History is stored in IndexedDB (via idb-keyval) since output/input images
// as data URLs can easily exceed localStorage's ~5MB ceiling.
const HISTORY_INDEX_KEY = "ips.history.index"

export async function listHistory() {
  const index = (await get(HISTORY_INDEX_KEY)) || []
  const items = await Promise.all(index.map((id) => get(`ips.history.item.${id}`)))
  return items.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt)
}

export async function addHistoryItem(item) {
  const index = (await get(HISTORY_INDEX_KEY)) || []
  await set(`ips.history.item.${item.id}`, item)
  await set(HISTORY_INDEX_KEY, [...index, item.id])
  return item
}

export async function updateHistoryItem(id, patch) {
  const existing = await get(`ips.history.item.${id}`)
  if (!existing) return null
  const updated = { ...existing, ...patch }
  await set(`ips.history.item.${id}`, updated)
  return updated
}

export async function removeHistoryItem(id) {
  const index = (await get(HISTORY_INDEX_KEY)) || []
  await del(`ips.history.item.${id}`)
  await set(HISTORY_INDEX_KEY, index.filter((i) => i !== id))
}

export async function clearHistory() {
  const index = (await get(HISTORY_INDEX_KEY)) || []
  await Promise.all(index.map((id) => del(`ips.history.item.${id}`)))
  await set(HISTORY_INDEX_KEY, [])
}

// Locally-tracked count of kie.ai uploads in the trailing 30 days, so the UI
// can show how close you are to the free tier's "30 uploads / 30 days" cap
// before you hit the 401. This is just a local log of timestamps - kie.ai's
// own count is authoritative, this is only an estimate.
const KIE_UPLOAD_LOG_KEY = "ips.kieUploadLog.v1"
const ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function readKieUploadLog() {
  try {
    const raw = localStorage.getItem(KIE_UPLOAD_LOG_KEY)
    const log = raw ? JSON.parse(raw) : []
    const now = Date.now()
    return Array.isArray(log) ? log.filter((ts) => now - ts < ROLLING_WINDOW_MS) : []
  } catch {
    return []
  }
}

// Call once per actual kie.ai upload (or with count > 1 to log several at
// once). Returns the up-to-date rolling 30-day total.
export function recordKieUploads(count = 1) {
  try {
    const log = readKieUploadLog()
    const now = Date.now()
    for (let i = 0; i < count; i++) log.push(now)
    localStorage.setItem(KIE_UPLOAD_LOG_KEY, JSON.stringify(log))
    return log.length
  } catch {
    return null
  }
}

export function getKieUploadCount() {
  return readKieUploadLog().length
}
