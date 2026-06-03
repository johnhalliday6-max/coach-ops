function toMiles(metres) {
  return Math.round((Number(metres || 0) / 1609.344) * 10) / 10
}

function toYards(metres) {
  return Math.round(Number(metres || 0) * 1.09361)
}

function toMinutes(seconds) {
  return Math.max(1, Math.round(Number(seconds || 0) / 60))
}

function formatDistance(metres) {
  const miles = toMiles(metres)
  if (miles >= 0.2) return `${miles} mi`
  return `${toYards(metres)} yd`
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
    search: query,
  }
}

function instructionText(step) {
  const roadName = step.name || step.ref || 'road'
  const maneuver = step.maneuver || {}
  const type = maneuver.type || 'continue'
  const modifier = maneuver.modifier || ''
  const exit = maneuver.exit
  const destinations = Array.isArray(step.destinations)
    ? step.destinations.join(', ')
    : step.destinations

  if (type === 'depart') return `Start on ${roadName}`
  if (type === 'arrive') return 'Arrive at destination'
  if (type === 'roundabout') return `At roundabout${exit ? ` take exit ${exit}` : ''}${roadName ? ` onto ${roadName}` : ''}`
  if (type === 'rotary') return `At rotary${exit ? ` take exit ${exit}` : ''}${roadName ? ` onto ${roadName}` : ''}`
  if (type === 'turn') return `Turn ${modifier || ''} onto ${roadName}`.replace(/\s+/g, ' ').trim()
  if (type === 'merge') return `Merge ${modifier || ''} onto ${roadName}`.replace(/\s+/g, ' ').trim()
  if (type === 'on ramp') return `Take the slip road ${modifier || ''} onto ${roadName}`.replace(/\s+/g, ' ').trim()
  if (type === 'off ramp') return `Take the exit ${modifier || ''}${destinations ? ` towards ${destinations}` : ''}`.replace(/\s+/g, ' ').trim()
  if (type === 'fork') return `Keep ${modifier || ''} onto ${roadName}`.replace(/\s+/g, ' ').trim()
  if (type === 'end of road') return `At the end of the road, turn ${modifier || ''} onto ${roadName}`.replace(/\s+/g, ' ').trim()
  if (type === 'continue' || type === 'new name') return `Continue on ${roadName}`

  return `${type} ${modifier} onto ${roadName}`.replace(/\s+/g, ' ').trim()
}

function makeLaneHint(step) {
  const intersections = Array.isArray(step.intersections) ? step.intersections : []
  const laneIntersection = intersections.find((item) => Array.isArray(item.lanes) && item.lanes.length)
  if (!laneIntersection) return null

  const lanes = laneIntersection.lanes
  const validCount = lanes.filter((lane) => lane.valid).length
  const total = lanes.length
  if (!total || !validCount) return null

  return `Use ${validCount} of ${total} lanes`
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
        ? [String(body.waypoint).trim()]
        : []

    if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
      return res.status(400).json({ ok: false, error: 'Missing current GPS location' })
    }

    if (!destination) {
      return res.status(400).json({ ok: false, error: 'Missing destination' })
    }

    const stopPoints = []
    for (const stop of stops) {
      const point = await geocode(stop)
      if (!point) return res.status(404).json({ ok: false, error: `Stop not found: ${stop}` })
      stopPoints.push(point)
    }

    const end = await geocode(destination)
    if (!end) {
      return res.status(404).json({ ok: false, error: 'Destination not found' })
    }

    const coords = [[startLng, startLat]]
    for (const point of stopPoints) coords.push([point.lng, point.lat])
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
      .flatMap((leg, legIndex) => (leg.steps || []).map((step) => ({ ...step, legIndex })))
      .filter((step) => step && step.distance > 5)
      .map((step, index) => {
        const maneuver = step.maneuver || {}
        const location = Array.isArray(maneuver.location)
          ? { lat: maneuver.location[1], lng: maneuver.location[0] }
          : null

        return {
          id: index + 1,
          instruction: instructionText(step),
          roadName: step.name || step.ref || '',
          distanceMiles: toMiles(step.distance),
          distanceText: formatDistance(step.distance),
          durationMinutes: toMinutes(step.duration),
          type: maneuver.type || 'continue',
          modifier: maneuver.modifier || '',
          exit: maneuver.exit || null,
          laneHint: makeLaneHint(step),
          location,
        }
      })

    return res.status(200).json({
      ok: true,
      route: {
        start: { lat: startLat, lng: startLng, label: 'Current Location' },
        end,
        stopPoints,
        destination,
        stops,
        waypoint: stops[0] || '',
        waypointPoint: stopPoints[0] || null,
        geometry,
        distanceMiles: toMiles(route.distance),
        durationMinutes: toMinutes(route.duration),
        instructions,
        nextInstruction: instructions[1] || instructions[0] || null,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Route planner failed', details: String(error) })
  }
}
