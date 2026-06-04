import { savedMatches } from './lib/places.js'

function cleanLabel(row, fallback) {
  return row?.display_name || row?.name || fallback
}

async function nominatimSearch(query) {
  const rows = []
  const queryVariants = [query, `${query}, UK`]
  for (const text of queryVariants) {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '10')
    url.searchParams.set('countrycodes', 'gb')
    url.searchParams.set('q', text)

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CoachOpsPrototype/1.0', Accept: 'application/json' },
      })
      const data = await response.json()
      if (Array.isArray(data)) rows.push(...data)
    } catch (error) {
      console.warn('Nominatim search failed', error.message)
    }
  }
  return rows.map((row) => ({
    label: cleanLabel(row, query),
    shortLabel: row.name || row.address?.amenity || row.address?.railway || row.address?.road || row.address?.town || query,
    lat: Number(row.lat),
    lng: Number(row.lon),
    type: row.type || row.class || 'Place',
    source: 'nominatim',
  }))
}

async function photonSearch(query) {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('lang', 'en')

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    const data = await response.json()
    const features = Array.isArray(data?.features) ? data.features : []
    return features
      .filter((feature) => {
        const country = String(feature?.properties?.countrycode || feature?.properties?.country || '').toUpperCase()
        return !country || country === 'GB' || country === 'UK'
      })
      .map((feature) => {
        const props = feature.properties || {}
        const [lng, lat] = feature.geometry?.coordinates || []
        const parts = [props.name, props.street, props.city, props.state, props.country].filter(Boolean)
        return {
          label: parts.join(', ') || query,
          shortLabel: props.name || query,
          lat: Number(lat),
          lng: Number(lng),
          type: props.osm_value || props.type || 'Place',
          source: 'photon',
        }
      })
  } catch (error) {
    console.warn('Photon search failed', error.message)
    return []
  }
}

export default async function handler(req, res) {
  try {
    const query = String(req.query?.q || '').trim()
    if (query.length < 2) return res.status(200).json({ ok: true, results: [] })

    const saved = savedMatches(query, 10)
    const [photon, nominatim] = await Promise.all([photonSearch(query), nominatimSearch(query)])

    const seen = new Set()
    const results = [...saved, ...photon, ...nominatim]
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
      .filter((row) => {
        const key = `${String(row.shortLabel).toLowerCase()}-${row.lat.toFixed(5)}-${row.lng.toFixed(5)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 15)

    return res.status(200).json({ ok: true, results })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Place search failed', details: String(error) })
  }
}
