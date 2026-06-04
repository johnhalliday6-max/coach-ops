const SAVED_PLACES = [
  { terms: ['esk valley', 'esk valley coaches', 'fairfield way', 'whitby depot'], lat: 54.47587, lng: -0.62705, label: 'Esk Valley Coaches, 4 Fairfield Way, Whitby YO22 4PU', shortLabel: 'Esk Valley Coaches', type: 'saved' },
  { terms: ['scarborough train station', 'scarborough railway station', 'scarborough station', 'westborough station'], lat: 54.27976, lng: -0.4057, label: 'Scarborough Railway Station, Westborough, Scarborough YO11 1TN', shortLabel: 'Scarborough Railway Station', type: 'saved' },
  { terms: ['manchester airport t2', 'manchester terminal 2', 'terminal 2 manchester'], lat: 53.36513, lng: -2.27261, label: 'Manchester Airport Terminal 2', shortLabel: 'Manchester Airport T2', type: 'saved' },
  { terms: ['birch services', 'birch motorway services'], lat: 53.55534, lng: -2.22173, label: 'Birch Services M62', shortLabel: 'Birch Services', type: 'saved' },
  { terms: ['wetherby services'], lat: 53.9287, lng: -1.3866, label: 'Wetherby Services A1(M)', shortLabel: 'Wetherby Services', type: 'saved' },
  { terms: ['scotch corner'], lat: 54.4431, lng: -1.6696, label: 'Scotch Corner Services', shortLabel: 'Scotch Corner', type: 'saved' },
  { terms: ['york racecourse'], lat: 53.93872, lng: -1.09682, label: 'York Racecourse', shortLabel: 'York Racecourse', type: 'saved' },
  { terms: ['victoria coach station', 'london victoria'], lat: 51.49321, lng: -0.14918, label: 'Victoria Coach Station, London', shortLabel: 'Victoria Coach Station', type: 'saved' },
]

function savedMatches(query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return []
  return SAVED_PLACES.filter((place) =>
    place.terms.some((term) => term.includes(q) || q.includes(term)),
  ).map(({ terms, ...place }) => place)
}

export default async function handler(req, res) {
  try {
    const query = String(req.query?.q || '').trim()
    if (query.length < 2) return res.status(200).json({ ok: true, results: [] })

    const saved = savedMatches(query)
    const allRows = []
    const queries = [query, `${query}, UK`, `${query}, North Yorkshire, UK`]

    for (const searchText of queries) {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'json')
      url.searchParams.set('addressdetails', '1')
      url.searchParams.set('limit', '8')
      url.searchParams.set('countrycodes', 'gb')
      url.searchParams.set('q', searchText)

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'CoachOpsPrototype/1.0', Accept: 'application/json' },
        })
        const rows = await response.json()
        if (Array.isArray(rows)) allRows.push(...rows)
      } catch (error) {
        console.warn('Nominatim search failed', error.message)
      }
    }

    const seen = new Set()
    const nominatim = allRows
      .map((row) => ({
        label: row.display_name,
        shortLabel: row.name || row.address?.railway || row.address?.road || row.address?.town || row.display_name,
        lat: Number(row.lat),
        lng: Number(row.lon),
        type: row.type,
        class: row.class,
      }))
      .filter((row) => {
        const key = `${row.label}-${row.lat}-${row.lng}`
        if (seen.has(key)) return false
        seen.add(key)
        return Number.isFinite(row.lat) && Number.isFinite(row.lng)
      })

    return res.status(200).json({ ok: true, results: [...saved, ...nominatim].slice(0, 12) })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Place search failed', details: String(error) })
  }
}
