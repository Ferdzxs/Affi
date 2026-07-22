// Proxies a single image fetch server-side.
//
// Why this exists: the "Ad creation instructions" step needs to re-download
// the just-rendered storyboard image (from kie.ai) into a File so it can be
// sent to Gemini Vision. A browser <img> tag can display that image fine,
// but a browser fetch() to read its raw bytes is blocked by CORS if kie.ai's
// CDN doesn't send an Access-Control-Allow-Origin header - which is exactly
// what produced the "Could not fetch the generated image (network error)"
// message. A server-side fetch (this function, running on Netlify's infra,
// not in the browser) has no such CORS restriction, so it's used as an
// automatic fallback whenever the direct browser fetch fails.
exports.handler = async (event) => {
  const url = event.queryStringParameters?.url

  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing url query parameter." }) }
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid url." }) }
  }
  if (parsed.protocol !== "https:") {
    return { statusCode: 400, body: JSON.stringify({ error: "Only https:// URLs are allowed." }) }
  }

  try {
    const upstream = await fetch(url)
    if (!upstream.ok) {
      return { statusCode: upstream.status, body: JSON.stringify({ error: `Upstream returned ${upstream.status}` }) }
    }
    const contentType = upstream.headers.get("content-type") || "image/png"
    const buffer = Buffer.from(await upstream.arrayBuffer())

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Could not fetch upstream image: ${err.message}` }) }
  }
}
