const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
)

function sendTransparentTile(res) {
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
  return res.status(200).send(TRANSPARENT_PNG)
}

export default async function handler(req, res) {
  try {
    const key = process.env.TOMTOM_API_KEY || process.env.VITE_TOMTOM_API_KEY || process.env.TOMTOM_KEY
    if (!key) return sendTransparentTile(res)

    const z = Number(req.query?.z)
    const x = Number(req.query?.x)
    const y = Number(req.query?.y)
    if (![z, x, y].every(Number.isFinite)) return res.status(400).send('Missing tile coordinates')

    const kind = String(req.query?.kind || 'flow')
    const style = String(req.query?.style || 'relative0')
    const url =
      kind === 'base'
        ? `https://api.tomtom.com/map/1/tile/basic/main/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`
        : `https://api.tomtom.com/traffic/map/4/tile/flow/${encodeURIComponent(style)}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`
    const response = await fetch(url)
    if (!response.ok) return sendTransparentTile(res)

    const buffer = Buffer.from(await response.arrayBuffer())
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', kind === 'base' ? 'public, max-age=3600, s-maxage=3600' : 'public, max-age=60, s-maxage=60')
    return res.status(200).send(buffer)
  } catch (error) {
    return sendTransparentTile(res)
  }
}
