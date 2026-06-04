import { hasSupabase, supabaseFetch } from './lib/storage.js'

const store = globalThis.__coachOpsRoutesStore || new Map()
globalThis.__coachOpsRoutesStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

function memoryRoutes() {
  return Array.from(store.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function toNumberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? String(value) : null
}

function toDbRoute(route) {
  // Keep the database insert deliberately simple so it works with the schema we created in Supabase.
  // Full route geometry/instructions are stored inside stops.route as JSONB.
  return {
    vehicle: route.fleetNo,
    destination: route.destination || 'Destination',
    stops: {
      route,
      stops: route.stops || [],
      waypoints: route.waypoints || [],
      savedBy: 'coach-ops',
    },
    distance: toNumberOrNull(route.distanceMiles),
    duration: toNumberOrNull(route.durationMinutes),
    created_at: route.updatedAt || new Date().toISOString(),
  }
}

function fromDbRoute(row) {
  const stored = row?.stops?.route || {}
  return {
    ...stored,
    fleetNo: cleanVehicleId(row.vehicle || stored.fleetNo),
    destination: row.destination || stored.destination || 'Destination',
    stops: stored.stops || row?.stops?.stops || [],
    waypoints: stored.waypoints || row?.stops?.waypoints || [],
    distanceMiles: stored.distanceMiles ?? row.distance ?? null,
    durationMinutes: stored.durationMinutes ?? row.duration ?? null,
    updatedAt: row.created_at || stored.updatedAt,
  }
}

async function saveRouteToSupabase(vehicleId, route) {
  if (!hasSupabase()) return { saved: false, reason: 'supabase-not-configured' }

  // Keep only the latest route for a vehicle. If delete fails, still try insert.
  try {
    await supabaseFetch(`routes?vehicle=eq.${encodeURIComponent(vehicleId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  } catch (error) {
    console.warn('Supabase old route delete failed', error.message)
  }

  const rows = await supabaseFetch('routes', {
    method: 'POST',
    body: JSON.stringify(toDbRoute(route)),
  })

  return { saved: true, rows }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg || body.vehicle)
      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const route = {
        fleetNo: vehicleId,
        reg: body.reg || vehicleId,
        destination: body.destination || body.end?.label || 'Destination',
        waypoint: body.waypoint || '',
        startLabel: body.startLabel || body.start?.label || 'Current Location',
        start: body.start || null,
        end: body.end || null,
        waypointPoint: body.waypointPoint || null,
        waypoints: Array.isArray(body.waypoints) ? body.waypoints : [],
        stops: Array.isArray(body.stops) ? body.stops : [],
        instructions: Array.isArray(body.instructions) ? body.instructions : [],
        geometry: Array.isArray(body.geometry) ? body.geometry : [],
        distanceMiles: body.distanceMiles ?? null,
        durationMinutes: body.durationMinutes ?? null,
        engine: body.engine || 'unknown',
        updatedAt: body.updatedAt || new Date().toISOString(),
      }

      store.set(vehicleId, route)

      let supabase = { saved: false, reason: 'not-attempted' }
      if (hasSupabase()) {
        try {
          supabase = await saveRouteToSupabase(vehicleId, route)
        } catch (error) {
          supabase = { saved: false, error: error.message }
          console.warn('Supabase route save failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, route, supabase })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)

      if (hasSupabase()) {
        try {
          const rows = await supabaseFetch(
            vehicleId
              ? `routes?vehicle=eq.${encodeURIComponent(vehicleId)}&order=created_at.desc&limit=1`
              : 'routes?order=created_at.desc&limit=50',
          )
          const routes = (Array.isArray(rows) ? rows : []).map(fromDbRoute)
          return res.status(200).json({ ok: true, route: vehicleId ? routes[0] || null : null, routes, source: 'supabase' })
        } catch (error) {
          console.warn('Supabase route read failed, using memory fallback', error.message)
        }
      }

      const routes = memoryRoutes()
      if (vehicleId) return res.status(200).json({ ok: true, route: store.get(vehicleId) || null, routes, source: 'memory' })
      return res.status(200).json({ ok: true, routes, source: 'memory' })
    }

    if (req.method === 'DELETE') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)
      if (vehicleId) store.delete(vehicleId)
      else store.clear()

      if (hasSupabase()) {
        try {
          const path = vehicleId ? `routes?vehicle=eq.${encodeURIComponent(vehicleId)}` : 'routes'
          await supabaseFetch(path, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        } catch (error) {
          console.warn('Supabase route delete failed', error.message)
        }
      }

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Routes API failed', details: String(error) })
  }
}
