import { findSavedPlace } from '../server/lib/places.js'

function toMiles(metres) {
  return Math.round((Number(metres || 0) / 1609.344) * 10) / 10
}

function toMinutes(seconds) {
  return Math.max(1, Math.round(Number(seconds || 0) / 60))
}

async function geocode(query) {
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) return null

  const saved = findSavedPlace(cleanQuery)
  if (saved) return { lat: saved.lat, lng: saved.lng, label: saved.label, shortLabel: saved.shortLabel }

  const expandedQueries = [
    cleanQuery,
    `${cleanQuery}, UK`,
    `${cleanQuery}, North Yorkshire, UK`,
  ]

  // Try Photon first because it is often better for landmarks and stations.
  try {
    const photonUrl = new URL('https://photon.komoot.io/api/')
    photonUrl.searchParams.set('q', cleanQuery)
    photonUrl.searchParams.set('limit', '5')
    photonUrl.searchParams.set('lang', 'en')
    const photonResponse = await fetch(photonUrl, { headers: { Accept: 'application/json' } })
    const photonData = await photonResponse.json()
    const photonFeature = (Array.isArray(photonData?.features) ? photonData.features : []).find((feature) => {
      const country = String(feature?.properties?.countrycode || feature?.properties?.country || '').toUpperCase()
      return !country || country === 'GB' || country === 'UK'
    })
    const [lng, lat] = photonFeature?.geometry?.coordinates || []
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const props = photonFeature.properties || {}
      return {
        lat: Number(lat),
        lng: Number(lng),
        label: [props.name, props.street, props.city, props.country].filter(Boolean).join(', ') || cleanQuery,
        shortLabel: props.name || cleanQuery,
      }
    }
  } catch (error) {
    console.warn('Photon geocode failed', error.message)
  }

  for (const text of expandedQueries) {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('countrycodes', 'gb')
    url.searchParams.set('q', text)

    const response = await fetch(url, {
      headers: { 'User-Agent': 'CoachOpsPrototype/1.0', Accept: 'application/json' },
    })

    const rows = await response.json()
    const first = Array.isArray(rows) ? rows[0] : null
    if (first) {
      return {
        lat: Number(first.lat),
        lng: Number(first.lon),
        label: first.display_name,
        shortLabel: first.name || cleanQuery,
      }
    }
  }

  return null
}

function decodeValhallaShape(str, precision = 6) {
  if (!str) return []
  let index = 0
  let lat = 0
  let lng = 0
  const coordinates = []
  const factor = Math.pow(10, precision)

  while (index < str.length) {
    let result = 1
    let shift = 0
    let b
    do {
      b = str.charCodeAt(index++) - 63 - 1
      result += b << shift
      shift += 5
    } while (b >= 0x1f)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)

    result = 1
    shift = 0
    do {
      b = str.charCodeAt(index++) - 63 - 1
      result += b << shift
      shift += 5
    } while (b >= 0x1f)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)

    coordinates.push([lat / factor, lng / factor])
  }

  return coordinates
}

function instructionForOsrmStep(step) {
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

function valhallaInstructionType(type) {
  if (type == null) return 'continue'
  if ([15, 16].includes(Number(type))) return 'arrive'
  if ([9, 10, 11, 12, 13, 14].includes(Number(type))) return 'turn'
  if ([26, 27].includes(Number(type))) return 'roundabout'
  return 'continue'
}

async function buildValhallaRoute(points, body) {
  const locations = points.map((point) => ({ lat: point.lat, lon: point.lng, type: 'break' }))
  const requestBody = {
    locations,
    costing: 'truck',
    costing_options: {
      truck: {
        height: Number(body.height || 4.3),
        width: Number(body.width || 2.55),
        length: Number(body.length || 13),
        weight: Number(body.weight || 18),
      },
    },
    directions_options: { units: 'miles' },
  }

  const response = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) throw new Error(`Valhalla ${response.status}`)
  const data = await response.json()
  const trip = data?.trip
  if (!trip?.legs?.length) throw new Error('No Valhalla route')

  const geometry = trip.legs.flatMap((leg) => decodeValhallaShape(leg.shape || ''))
  const instructions = trip.legs.flatMap((leg) => leg.maneuvers || []).map((step, index) => {
    const shapeIndex = Number(step.begin_shape_index || 0)
    const location = geometry[shapeIndex] || geometry[0] || null
    return {
      id: index + 1,
      instruction: step.instruction || 'Continue',
      verbal: step.verbal_pre_transition_instruction || step.instruction || 'Continue',
      roadName: step.street_names?.[0] || step.begin_street_names?.[0] || '',
      distanceMiles: Math.round(Number(step.length || 0) * 10) / 10,
      distanceMetres: Math.round(Number(step.length || 0) * 1609.344),
      durationMinutes: Math.max(1, Math.round(Number(step.time || 0) / 60)),
      type: valhallaInstructionType(step.type),
      modifier: '',
      exit: step.roundabout_exit_count || null,
      location,
      beginShapeIndex: shapeIndex,
      endShapeIndex: Number(step.end_shape_index || shapeIndex),
    }
  }).filter((step) => step.distanceMetres > 5 || step.type === 'arrive')

  return {
    geometry,
    distanceMiles: Math.round(Number(trip.summary?.length || 0) * 10) / 10,
    durationMinutes: Math.max(1, Math.round(Number(trip.summary?.time || 0) / 60)),
    instructions,
    engine: 'valhalla',
  }
}

async function buildOsrmRoute(points) {
  const coordText = points.map((point) => `${point.lng},${point.lat}`).join(';')
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordText}?overview=full&geometries=geojson&steps=true&annotations=true`
  const routeResponse = await fetch(osrmUrl)
  const routeData = await routeResponse.json()
  const route = routeData?.routes?.[0]
  if (!route) throw new Error('Could not build route')

  const geometry = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
  const instructions = (route.legs || [])
    .flatMap((leg) => leg.steps || [])
    .filter((step) => step && step.distance > 10)
    .slice(0, 120)
    .map((step, index) => ({
      id: index + 1,
      instruction: instructionForOsrmStep(step),
      verbal: instructionForOsrmStep(step),
      roadName: step.name || '',
      distanceMiles: toMiles(step.distance),
      distanceMetres: Math.round(Number(step.distance || 0)),
      durationMinutes: toMinutes(step.duration),
      type: step.maneuver?.type || 'continue',
      modifier: step.maneuver?.modifier || '',
      exit: step.maneuver?.exit || null,
      location: step.maneuver?.location ? [step.maneuver.location[1], step.maneuver.location[0]] : null,
    }))

  return {
    geometry,
    distanceMiles: toMiles(route.distance),
    durationMinutes: toMinutes(route.duration),
    instructions,
    engine: 'osrm-fallback',
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

    const body = req.body || {}
    const startLat = Number(body.startLat)
    const startLng = Number(body.startLng)
    const rawPoints = Array.isArray(body.points)
      ? body.points
          .map((point) => ({
            lat: Number(point.lat),
            lng: Number(point.lng),
            label: String(point.label || point.name || 'Route point'),
          }))
          .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      : []
    const destination = String(body.destination || rawPoints[rawPoints.length - 1]?.label || '').trim()
    const stops = Array.isArray(body.stops)
      ? body.stops.map((item) => String(item || '').trim()).filter(Boolean)
      : String(body.waypoint || '').trim()
        ? [String(body.waypoint || '').trim()]
        : []

    if (rawPoints.length >= 2) {
      const points = rawPoints
      const end = points[points.length - 1]
      const waypointPoints = points.slice(1, -1).map((point) => ({ ...point, input: point.label }))
      let built
      try {
        built = await buildValhallaRoute(points, body)
      } catch (error) {
        console.warn('Valhalla failed for plotted route, falling back to OSRM', error.message)
        built = await buildOsrmRoute(points)
      }

      return res.status(200).json({
        ok: true,
        route: {
          start: { ...points[0], label: points[0].label || 'Route start' },
          end,
          waypointPoint: waypointPoints[0] || null,
          waypoints: waypointPoints,
          destination,
          waypoint: waypointPoints.map((point) => point.label).join(' → '),
          stops: waypointPoints.map((point) => point.label),
          plotPoints: points,
          ...built,
          updatedAt: new Date().toISOString(),
        },
      })
    }

    if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
      return res.status(400).json({ ok: false, error: 'Missing current GPS location' })
    }
    if (!destination) return res.status(400).json({ ok: false, error: 'Missing destination' })

    const end = await geocode(destination)
    if (!end) return res.status(404).json({ ok: false, error: 'Destination not found' })

    const waypointPoints = []
    for (const stop of stops) {
      const point = await geocode(stop)
      if (!point) return res.status(404).json({ ok: false, error: `Stop not found: ${stop}` })
      waypointPoints.push({ ...point, input: stop })
    }

    const points = [{ lat: startLat, lng: startLng, label: 'Current Location' }, ...waypointPoints, end]

    let built
    try {
      built = await buildValhallaRoute(points, body)
    } catch (error) {
      console.warn('Valhalla failed, falling back to OSRM', error.message)
      built = await buildOsrmRoute(points)
    }

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
        ...built,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Route planner failed', details: String(error) })
  }
}
