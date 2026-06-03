const STATIC_PLACES = [
  { name: 'London Victoria Coach Station', type: 'Coach Station' },
  { name: 'Manchester Airport Terminal 1', type: 'Airport' },
  { name: 'Manchester Airport Terminal 2', type: 'Airport' },
  { name: 'Manchester Airport Terminal 3', type: 'Airport' },
  { name: 'Leeds Bradford Airport', type: 'Airport' },
  { name: 'Newcastle Airport', type: 'Airport' },
  { name: 'York Racecourse', type: 'Pickup' },
  { name: 'York Station', type: 'Rail Station' },
  { name: 'Peterborough Services', type: 'Services' },
  { name: 'Wetherby Services', type: 'Services' },
  { name: 'Ferrybridge Services', type: 'Services' },
  { name: 'Scotch Corner Services', type: 'Services' },
  { name: 'Washington Services', type: 'Services' },
  { name: 'Woodall Services', type: 'Services' },
  { name: 'Tibshelf Services', type: 'Services' },
  { name: 'Cambridge Services', type: 'Services' },
  { name: 'Leeming Bar Services', type: 'Services' },
  { name: 'Durham City Centre', type: 'City' },
  { name: 'Newcastle upon Tyne', type: 'City' },
  { name: 'Leeds Coach Station', type: 'Coach Station' },
]

export default async function handler(req, res) {
  try {
    const q = String(req.query?.q || '').trim()

    if (q.length < 2) {
      return res.status(200).json({ ok: true, suggestions: STATIC_PLACES.slice(0, 8) })
    }

    const localMatches = STATIC_PLACES
      .filter((place) => place.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8)

    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '6')
    url.searchParams.set('countrycodes', 'gb')
    url.searchParams.set('q', q)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CoachOpsPrototype/1.0',
        Accept: 'application/json',
      },
    })

    const rows = await response.json()
    const webMatches = Array.isArray(rows)
      ? rows.map((item) => ({
          name: item.display_name,
          type: item.type || item.class || 'Place',
          lat: Number(item.lat),
          lng: Number(item.lon),
        }))
      : []

    const seen = new Set()
    const suggestions = [...localMatches, ...webMatches]
      .filter((item) => {
        const key = item.name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)

    return res.status(200).json({ ok: true, suggestions })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Suggestion lookup failed', details: String(error) })
  }
}
