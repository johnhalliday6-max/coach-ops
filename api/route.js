function toMiles(metres) {
  return Math.round((Number(metres || 0) / 1609.344) * 10) / 10
}

function toMinutes(seconds) {
  return Math.max(1, Math.round(Number(seconds || 0) / 60))
}

async function geocode(query) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return null

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'gb')
  url.searchParams.set('q', cleanQuery)

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
    shortLabel: first.name || cleanQuery,
  }
}

function instructionForStep(step) {
  const roadName = step.name || 'road'
  const maneuver = step.maneuver || {}
  const type = maneuver.type || 'continue'
  const modifier = maneuver.modifier || ''
  const exit = maneuver.exit ? ` ${maneuver.exit}` : ''

  if (type === 'depart') return `Start on ${roadName}`
  if (type === 'arrive') return 'Arrive at destination'
  if (type === 'turn') return `Turn ${modifier} onto ${roadName}`
  if (type === 'new name') return `Continue on ${roadName}`
  if (type === 'merge') return `Merge ${modifier} onto ${roadName}`
  if (type === 'on ramp') return `Take ramp ${modifier} onto ${roadName}`
  if (type === 'off ramp') return `Take exit${exit} ${modifier} onto ${roadName}`
  if (type === 'fork') return `Keep ${modifier} onto ${roadName}`
  if (type === 'roundabout' || type === 'rotary') return `At roundabout, take exit${exit} onto ${roadName}`
  if (type === 'roundabout turn') return `At roundabout, turn ${modifier} onto ${roadName}`

  return `Continue on ${roadName}`
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
    const stops = Array.isArray(body.stops)
      ? body.stops.map((item) => String(item || '').trim()).filter(Boolean)
      : String(body.waypoint || '').trim()
        ? [String(body.waypoint || '').trim()]
        : []

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

    const waypointPoints = []
    for (const stop of stops) {
      const point = await geocode(stop)
      if (!point) {
        return res.status(404).json({ ok: false, error: `Stop not found: ${stop}` })
      }
      waypointPoints.push({ ...point, input: stop })
    }

    const coords = [[startLng, startLat]]
    waypointPoints.forEach((point) => coords.push([point.lng, point.lat]))
    coords.push([end.lng, end.lat])

    const coordText = coords.map((pair) => pair.join(',')).join(';')
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordText}?overview=full&geometries=geojson&steps=true&annotations=true`

    const routeResponse = await fetch(osrmUrl)
    const routeData = await routeResponse.json()
    const route = routeData?.routes?.[0]

    if (!route) {
      return res.status(502).json({ ok: false, error: 'Could not build route' })
    }

    const geometry = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])

    const instructions = (route.legs || [])
      .flatMap((leg) => leg.steps || [])
      .filter((step) => step && step.distance > 10)
      .slice(0, 80)
      .map((step, index) => {
        return {
          id: index + 1,
          instruction: instructionForStep(step),
          roadName: step.name || '',
          distanceMiles: toMiles(step.distance),
          distanceMetres: Math.round(Number(step.distance || 0)),
          durationMinutes: toMinutes(step.duration),
          type: step.maneuver?.type || 'continue',
          modifier: step.maneuver?.modifier || '',
          exit: step.maneuver?.exit || null,
          location: step.maneuver?.location
            ? [step.maneuver.location[1], step.maneuver.location[0]]
            : null,
        }
      })

    return res.status(200).json({
      ok: true,
      route: {
        start: { lat: startLat, lng: startLng, label: 'Current Location' },
        end,
        waypointPoint: waypointPoints[0] || null,
        waypoints: waypointPoints,
        destination,
        waypoint: stops.join(' → '),
        stops,
        geometry,
        distanceMiles: toMiles(route.distance),
        durationMinutes: toMinutes(route.duration),
        instructions,
        updatedAt: new Date().toISOString(),
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
