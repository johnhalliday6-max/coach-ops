
const savedPlaces = [
  { shortLabel: 'Esk Valley Coaches', label: 'Esk Valley Coaches, 4 Fairfield Way, Stainsacre Lane Industrial Estate, Whitby, YO22 4PU', lat: 54.4719, lng: -0.6267, type: 'saved', class: 'coach_depot' },
  { shortLabel: 'Scarborough Railway Station', label: 'Scarborough Railway Station, Westborough, Scarborough, YO11 1TN', lat: 54.2798, lng: -0.4058, type: 'saved', class: 'railway_station' },
  { shortLabel: 'Manchester Airport Terminal 2', label: 'Manchester Airport Terminal 2, Manchester Airport, M90 4ZY', lat: 53.3676, lng: -2.2794, type: 'saved', class: 'airport' },
  { shortLabel: 'Birch Services', label: 'Birch Services, M62, Heywood, OL10 2QH', lat: 53.5604, lng: -2.2185, type: 'saved', class: 'services' },
  { shortLabel: 'Scarborough Spa', label: 'Scarborough Spa, South Bay, Scarborough, YO11 2HD', lat: 54.2758, lng: -0.4012, type: 'saved', class: 'venue' },
  { shortLabel: 'York Racecourse', label: 'York Racecourse, Knavesmire Road, York, YO23 1EX', lat: 53.9372, lng: -1.0972, type: 'saved', class: 'venue' },
]

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function savedMatches(query) {
  const q = norm(query)
  if (!q) return []
  return savedPlaces.filter((place) => {
    const text = norm(`${place.shortLabel} ${place.label}`)
    return text.includes(q) || q.split(' ').every((word) => text.includes(word))
  })
}

export default async function handler(req, res) {
  try {
    const query = String(req.query?.q || '').trim()

    if (query.length < 3) {
      return res.status(200).json({ ok: true, results: [] })
    }

    const priority = savedMatches(query)

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
    const liveResults = (Array.isArray(rows) ? rows : []).map((row) => ({
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

    const merged = [...priority, ...liveResults].filter((item, index, arr) =>
      index === arr.findIndex((other) => other.label === item.label)
    ).slice(0, 10)

    return res.status(200).json({ ok: true, results: merged })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Place search failed',
      details: String(error),
    })
  }
}
