export default async function handler(req, res) {
  try {
    const query = String(req.query?.q || '').trim()

    if (query.length < 3) {
      return res.status(200).json({ ok: true, results: [] })
    }

    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '8')
    url.searchParams.set('countrycodes', 'gb')
    url.searchParams.set('q', query)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CoachOpsPrototype/1.0',
        Accept: 'application/json',
      },
    })

    const rows = await response.json()
    const results = (Array.isArray(rows) ? rows : []).map((row) => ({
      label: row.display_name,
      shortLabel:
        row.name ||
        row.address?.railway ||
        row.address?.road ||
        row.address?.town ||
        row.display_name,
      lat: Number(row.lat),
      lng: Number(row.lon),
      type: row.type,
      class: row.class,
    }))

    return res.status(200).json({ ok: true, results })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Place search failed',
      details: String(error),
    })
  }
}
