const store = globalThis.__coachOpsRoutesStore || new Map()
globalThis.__coachOpsRoutesStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg)

      if (!vehicleId) {
        return res.status(400).json({ ok: false, error: 'Missing vehicle id' })
      }

      const route = {
        fleetNo: vehicleId,
        reg: body.reg || vehicleId,
        destination: body.destination || 'Destination',
        waypoint: body.waypoint || '',
        startLabel: body.startLabel || 'Current Location',
        start: body.start || null,
        end: body.end || null,
        waypointPoint: body.waypointPoint || null,
        geometry: Array.isArray(body.geometry) ? body.geometry : [],
        distanceMiles: body.distanceMiles || null,
        durationMinutes: body.durationMinutes || null,
        updatedAt: new Date().toISOString(),
      }

      store.set(vehicleId, route)

      return res.status(200).json({ ok: true, route })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)
      const routes = Array.from(store.values()).sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      )

      if (vehicleId) {
        const route = store.get(vehicleId) || null
        return res.status(200).json({ ok: true, route, routes })
      }

      return res.status(200).json({ ok: true, routes })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Routes API failed',
      details: String(error),
    })
  }
}
