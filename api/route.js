function toMiles(metres) {
  return Math.round((Number(metres || 0) / 1609.344) * 10) / 10
}

function toMinutes(seconds) {
  return Math.round(Number(seconds || 0) / 60)
}

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'gb')
  url.searchParams.set('q', query)

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CoachOpsPrototype/1.0',
      Accept: 'application/json',
    },
  })

  const rows = await response.json()
  const first = Array.isArray(rows) ? rows[0] : null

  if (!first) return null

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    label: first.display_name,
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const body = req.body || {}
    const startLat = Number(body.startLat)
    const startLng = Number(body.startLng)
    const destination = String(body.destination || '').trim()
    const waypoint = String(body.waypoint || '').trim()

    if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
      return res.status(400).json({ ok: false, error: 'Missing current GPS location' })
    }

    if (!destination) {
      return res.status(400).json({ ok: false, error: 'Missing destination' })
    }

    const end = await geocode(destination)
    if (!end) {
      return res.status(404).json({ ok: false, error: 'Destination not found' })
    }

    const waypointPoint = waypoint ? await geocode(waypoint) : null
    if (waypoint && !waypointPoint) {
      return res.status(404).json({ ok: false, error: 'Waypoint not found' })
    }

    const coords = [[startLng, startLat]]
    if (waypointPoint) coords.push([waypointPoint.lng, waypointPoint.lat])
    coords.push([end.lng, end.lat])

    const coordText = coords.map((pair) => pair.join(',')).join(';')
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordText}?overview=full&geometries=geojson&steps=false`

    const routeResponse = await fetch(osrmUrl)
    const routeData = await routeResponse.json()
    const route = routeData?.routes?.[0]

    if (!route) {
      return res.status(502).json({ ok: false, error: 'Could not build route' })
    }

    const geometry = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])

    return res.status(200).json({
      ok: true,
      route: {
        start: { lat: startLat, lng: startLng, label: 'Current Location' },
        end,
        waypointPoint,
        destination,
        waypoint,
        geometry,
        distanceMiles: toMiles(route.distance),
        durationMinutes: toMinutes(route.duration),
      },
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Route planner failed',
      details: String(error),
    })
  }
}
