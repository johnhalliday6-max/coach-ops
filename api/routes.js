const store = globalThis.__coachOpsRoutesStore || new Map()
globalThis.__coachOpsRoutesStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

function buildRoute(vehicleId, body) {
  return {
    id: body.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fleetNo: vehicleId,
    reg: body.reg || vehicleId,
    destination: body.destination || 'Destination',
    stops: Array.isArray(body.stops) ? body.stops : body.waypoint ? [body.waypoint] : [],
    waypoint: body.waypoint || (Array.isArray(body.stops) ? body.stops[0] : '') || '',
    startLabel: body.startLabel || 'Current Location',
    start: body.start || null,
    end: body.end || null,
    stopPoints: Array.isArray(body.stopPoints) ? body.stopPoints : body.waypointPoint ? [body.waypointPoint] : [],
    waypointPoint: body.waypointPoint || (Array.isArray(body.stopPoints) ? body.stopPoints[0] : null),
    geometry: Array.isArray(body.geometry) ? body.geometry : [],
    distanceMiles: body.distanceMiles || null,
    durationMinutes: body.durationMinutes || null,
    instructions: Array.isArray(body.instructions) ? body.instructions : [],
    nextInstruction: body.nextInstruction || null,
    source: body.source || 'driver',
    status: body.status || 'accepted',
    message: body.message || '',
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg)

      if (!vehicleId) {
        return res.status(400).json({ ok: false, error: 'Missing vehicle id' })
      }

      const route = buildRoute(vehicleId, body)
      store.set(vehicleId, route)

      return res.status(200).json({ ok: true, route })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg)
      const route = store.get(vehicleId)

      if (!vehicleId || !route) {
        return res.status(404).json({ ok: false, error: 'Route not found' })
      }

      const action = String(body.action || '').toLowerCase()
      if (action === 'accept') route.status = 'accepted'
      if (action === 'decline') route.status = 'declined'
      route.updatedAt = new Date().toISOString()
      store.set(vehicleId, route)

      return res.status(200).json({ ok: true, route })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)
      const routes = Array.from(store.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

      if (vehicleId) {
        const route = store.get(vehicleId) || null
        return res.status(200).json({ ok: true, route, routes })
      }

      return res.status(200).json({ ok: true, routes })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Routes API failed', details: String(error) })
  }
}
