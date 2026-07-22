/**
 * Builds a single "reference collage" image from multiple uploaded files,
 * entirely client-side (canvas), and returns it as a File.
 *
 * Why this exists: kie.ai's free tier caps uploads at 30 files within a
 * rolling 30 days ("Free users can upload up to 30 files within 30 days").
 * The old flow uploaded every source photo separately on every render, so a
 * single 10-photo batch burned a third of the monthly quota in one click,
 * and hitting "Try again" burned it again. Combining the batch into one
 * collage means a full batch costs exactly ONE kie.ai upload, and
 * GenerateView caches that uploaded URL so retries reuse it instead of
 * re-uploading.
 *
 * The original files are never sent to kie.ai. They're only read locally
 * (as inline base64) for the Gemini "describe" and "hashtag" steps, which
 * don't touch kie.ai's upload quota at all - only this collage does.
 */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not decode "${file.name}" while building the collage.`))
    }
    img.src = url
  })
}

function gridDims(count) {
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  return { cols, rows }
}

/**
 * Splits a flat file list into N contiguous groups (group 1 gets the extra
 * file when the count doesn't divide evenly). Used to build one collage per
 * group instead of a single collage from everything.
 */
export function splitIntoGroups(files, groupCount = 2) {
  if (!files?.length) return []
  const size = Math.ceil(files.length / groupCount)
  const groups = []
  for (let i = 0; i < files.length; i += size) {
    groups.push(files.slice(i, i + size))
  }
  return groups
}

/**
 * Splits the uploaded files into `groupCount` groups and builds one collage
 * File per group (via buildCollageFile). If there aren't enough files to
 * fill every group, fewer collages are returned - e.g. a single uploaded
 * photo always yields exactly one collage/file, never an empty second one.
 *
 * @param {File[]} files
 * @param {number} [groupCount]
 * @param {object} [options] - forwarded to buildCollageFile for each group
 * @returns {Promise<File[]>}
 */
export async function buildCollages(files, groupCount = 2, options = {}) {
  const groups = splitIntoGroups(files, groupCount).filter((g) => g.length)
  return Promise.all(
    groups.map((g, i) =>
      buildCollageFile(g, { fileName: `reference-collage-group-${i + 1}.png`, ...options })
    )
  )
}

/**
 * @param {File[]} files - source photos, in the order they should appear
 * @param {object} [options]
 * @param {number} [options.cellSize] - each photo is contain-fit into a square cell this many px wide
 * @param {number} [options.gap] - px between cells and around the border
 * @param {string} [options.background] - canvas background, shows in the gaps/letterboxing
 * @param {string} [options.fileName]
 * @returns {Promise<File>} a PNG File - kie.ai's createTask can fetch it once uploaded
 */
export async function buildCollageFile(
  files,
  { cellSize = 768, gap = 12, background = "#111111", fileName = "reference-collage.png" } = {}
) {
  if (!files?.length) throw new Error("No images to build a collage from.")

  // One photo is already "one upload" - nothing to gain from collaging it,
  // so skip the canvas round-trip and use it as-is.
  if (files.length === 1) return files[0]

  const loaded = await Promise.all(files.map(loadImage))
  try {
    const { cols, rows } = gridDims(loaded.length)
    const canvas = document.createElement("canvas")
    canvas.width = cols * cellSize + (cols + 1) * gap
    canvas.height = rows * cellSize + (rows + 1) * gap

    const ctx = canvas.getContext("2d")
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    loaded.forEach(({ img }, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cellX = gap + col * (cellSize + gap)
      const cellY = gap + row * (cellSize + gap)

      // Contain-fit so every source photo stays undistorted inside its cell.
      const scale = Math.min(cellSize / img.naturalWidth, cellSize / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      const dx = cellX + (cellSize - w) / 2
      const dy = cellY + (cellSize - h) / 2
      ctx.drawImage(img, dx, dy, w, h)
    })

    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas failed to export the collage."))), "image/png")
    )
    return new File([blob], fileName, { type: "image/png" })
  } finally {
    loaded.forEach(({ url }) => URL.revokeObjectURL(url))
  }
}
