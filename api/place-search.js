export default async function handler(req, res) {
  try {
    const query = String(req.query?.q || '').trim()

    if (query.length < 3) {
      return res.status(200).json({ ok: true, results: [] })
    }

    const searches = [query]
    const lower = query.toLowerCase()

    if (!lower.includes('uk') && !lower.includes('united kingdom')) searches.push(`${query}, UK`)
    if (lower.includes('station') && !lower.includes('railway')) searches.push(`${query} railway station UK`)
    if (lower.includes('airport') && !lower.includes('terminal')) searches.push(`${query} terminal UK`)
    if (lower.includes('services') || lower.includes('service')) searches.push(`${query} motorway services UK`)

    const seen = new Set()
    const results = []

    for (const search of searches) {
      if (results.length >= 12) break

      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'json')
      url.searchParams.set('addressdetails', '1')
      url.searchParams.set('limit', '10')
      url.searchParams.set('countrycodes', 'gb')
      url.searchParams.set('dedupe', '1')
      url.searchParams.set('q', search)

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CoachOpsPrototype/1.0 (route planning test)',
          Accept: 'application/json',
        },
      })

      const rows = await response.json()
      for (const row of Array.isArray(rows) ? rows : []) {
        const lat = Number(row.lat)
        const lng = Number(row.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

        const key = `${Math.round(lat * 10000)}:${Math.round(lng * 10000)}`
        if (seen.has(key)) continue
        seen.add(key)

        const label = row.display_name
        results.push({
          label,
          shortLabel:
            row.name ||
            row.address?.railway ||
            row.address?.amenity ||
            row.address?.road ||
            row.address?.suburb ||
            row.address?.town ||
            label,
          lat,
          lng,
          type: row.type,
          class: row.class,
        })
      }
    }

    return res.status(200).json({ ok: true, results: results.slice(0, 12) })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Place search failed',
      details: String(error),
    })
  }
}
