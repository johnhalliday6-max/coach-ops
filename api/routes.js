import { hasSupabase, supabaseFetch } from './_supabase.js'

const store = globalThis.__coachOpsRoutesStore || new Map()
globalThis.__coachOpsRoutesStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

function makeRoute(vehicleId, body = {}) {
  return {
    fleetNo: vehicleId,
    reg: body.reg || vehicleId,
    destination: body.destination || 'Destination',
    waypoint: body.waypoint || '',
    startLabel: body.startLabel || 'Current Location',
    start: body.start || null,
    end: body.end || null,
    waypointPoint: body.waypointPoint || null,
    waypoints: Array.isArray(body.waypoints) ? body.waypoints : [],
    stops: Array.isArray(body.stops) ? body.stops : [],
    instructions: Array.isArray(body.instructions) ? body.instructions : [],
    geometry: Array.isArray(body.geometry) ? body.geometry : [],
    distanceMiles: body.distanceMiles || null,
    durationMinutes: body.durationMinutes || null,
    updatedAt: body.updatedAt || new Date().toISOString(),
  }
}

function fromRouteRow(row) {
  if (!row) return null
  const payload = row.stops?.__route || row.stops || {}
  return {
    ...payload,
    fleetNo: row.vehicle,
    destination: row.destination || payload.destination,
    distanceMiles: payload.distanceMiles || row.distance,
    durationMinutes: payload.durationMinutes || row.duration,
    updatedAt: row.created_at || payload.updatedAt,
  }
}

async function saveRoute(route) {
  return supabaseFetch('routes', {
    method: 'POST',
    body: JSON.stringify({
      vehicle: route.fleetNo,
      destination: route.destination,
      stops: { __route: route },
      distance: route.distanceMiles == null ? null : String(route.distanceMiles),
      duration: route.durationMinutes == null ? null : String(route.durationMinutes),
      accepted: true,
      created_at: route.updatedAt,
    }),
  })
}

async function getRoutes(vehicleId) {
  const filter = vehicleId ? `&vehicle=eq.${encodeURIComponent(vehicleId)}` : ''
  const rows = await supabaseFetch(`routes?select=*&order=created_at.desc${filter}&limit=50`, {
    method: 'GET',
    headers: { Prefer: undefined },
  })

  const routes = []
  const seen = new Set()
  for (const row of rows || []) {
    const id = cleanVehicleId(row.vehicle)
    if (vehicleId) return { route: fromRouteRow(row), routes: rows.map(fromRouteRow).filter(Boolean) }
    if (!id || seen.has(id)) continue
    seen.add(id)
    routes.push(fromRouteRow(row))
  }
  return { route: null, routes }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg)
      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const route = makeRoute(vehicleId, body)
      store.set(vehicleId, route)
      if (hasSupabase()) await saveRoute(route)

      return res.status(200).json({ ok: true, route, persistent: hasSupabase() })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)

      if (hasSupabase()) {
        const result = await getRoutes(vehicleId)
        return res.status(200).json({ ok: true, ...result, persistent: true })
      }

      const routes = Array.from(store.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      if (vehicleId) return res.status(200).json({ ok: true, route: store.get(vehicleId) || null, routes, persistent: false })
      return res.status(200).json({ ok: true, routes, persistent: false })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Routes API failed', details: String(error) })
  }
}
