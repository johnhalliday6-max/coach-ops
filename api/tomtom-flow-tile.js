export default async function handler(req, res) {
  try {
    const key = process.env.TOMTOM_API_KEY || process.env.VITE_TOMTOM_API_KEY || process.env.TOMTOM_KEY
    if (!key) return res.status(404).send('Missing TomTom API key')

    const z = Number(req.query?.z)
    const x = Number(req.query?.x)
    const y = Number(req.query?.y)
    if (![z, x, y].every(Number.isFinite)) return res.status(400).send('Missing tile coordinates')

    const style = String(req.query?.style || 'relative0')
    const url = `https://api.tomtom.com/traffic/map/4/tile/flow/${encodeURIComponent(style)}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`
    const response = await fetch(url)
    if (!response.ok) return res.status(response.status).send('TomTom traffic tile failed')

    const buffer = Buffer.from(await response.arrayBuffer())
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    return res.status(200).send(buffer)
  } catch (error) {
    return res.status(500).send(`TomTom traffic tile failed: ${String(error)}`)
  }
}
