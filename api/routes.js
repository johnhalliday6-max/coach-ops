import { hasSupabase, supabaseFetch } from '../server/lib/storage.js'
import { bodyVehicleScope, cleanVehiclePart, legacyVehicleKeys, parseScopedVehicleKey, requestVehicleScope, vehicleCompany } from '../server/lib/vehicleIdentity.js'

const store = globalThis.__coachOpsRoutesStore || new Map()
globalThis.__coachOpsRoutesStore = store

function memoryRoutes() {
  const unique = new Map()
  Array.from(store.values()).forEach((route) => {
    if (String(route?.vehicleKey || '').startsWith('ROUTE_LIBRARY::')) return
    const key = route?.vehicleKey || `${route?.fleetNo || ''}-${route?.reg || ''}-${route?.updatedAt || ''}`
    if (key && !unique.has(key)) unique.set(key, route)
  })
  return Array.from(unique.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function toDbRoute(route) {
  return {
    vehicle: route.vehicleKey,
    destination: route.destination || 'Destination',
    stops: {
      route,
      stops: route.stops || [],
      waypoints: route.waypoints || [],
    },
    distance: route.distanceMiles == null ? null : String(route.distanceMiles),
    duration: route.durationMinutes == null ? null : String(route.durationMinutes),
    accepted: true,
    created_at: route.updatedAt || new Date().toISOString(),
  }
}

function fromDbRoute(row) {
  const stored = row?.stops?.route || {}
  const parsed = parseScopedVehicleKey(row.vehicle || stored.vehicleKey || stored.fleetNo)
  return {
    ...stored,
    vehicleKey: cleanVehiclePart(row.vehicle || stored.vehicleKey),
    fleetNo: cleanVehiclePart(stored.fleetNo || parsed.fleetNo),
    reg: stored.reg || parsed.reg || stored.fleetNo || parsed.fleetNo,
    company: stored.company || stored.category || stored.operator || parsed.company || 'Unassigned',
    destination: row.destination || stored.destination || 'Destination',
    stops: stored.stops || row?.stops?.stops || [],
    waypoints: stored.waypoints || row?.stops?.waypoints || [],
    distanceMiles: stored.distanceMiles || row.distance || null,
    durationMinutes: stored.durationMinutes || row.duration || null,
    updatedAt: stored.updatedAt || row.created_at,
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = bodyVehicleScope(body)
      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const route = {
        ...body,
        vehicleKey: vehicleId,
        fleetNo: cleanVehiclePart(body.fleetNo || body.vehicleId || body.reg),
        reg: body.reg || body.fleetNo || body.vehicleId,
        company: body.company || body.category || body.operator || vehicleCompany(body),
        destination: body.destination || body.routeName || body.name || 'Destination',
        waypoint: body.waypoint || '',
        startLabel: body.startLabel || 'Current Location',
        start: body.start || null,
        end: body.end || null,
        waypointPoint: body.waypointPoint || null,
        waypoints: Array.isArray(body.waypoints) ? body.waypoints : [],
        stops: Array.isArray(body.stops) ? body.stops : [],
        plotPoints: Array.isArray(body.plotPoints) ? body.plotPoints : [],
        instructions: Array.isArray(body.instructions) ? body.instructions : [],
        geometry: Array.isArray(body.geometry) ? body.geometry : [],
        distanceMiles: body.distanceMiles || null,
        durationMinutes: body.durationMinutes || null,
        engine: body.engine || 'unknown',
        updatedAt: body.updatedAt || new Date().toISOString(),
      }

      const aliasKeys = [vehicleId, ...legacyVehicleKeys(body)]
      aliasKeys.forEach((key) => store.set(key, route))

      if (hasSupabase()) {
        try {
          // Keep one active/latest route per vehicle. Supabase was keeping old routes,
          // which made driver/office maps show multiple stale routes.
          await supabaseFetch(`routes?vehicle=eq.${encodeURIComponent(vehicleId)}`, { method: 'DELETE' })
          for (const legacyKey of legacyVehicleKeys(body)) {
            await supabaseFetch(`routes?vehicle=eq.${encodeURIComponent(legacyKey)}`, { method: 'DELETE' })
          }
          await supabaseFetch('routes', {
            method: 'POST',
            body: JSON.stringify(toDbRoute(route)),
          })
        } catch (error) {
          console.warn('Supabase route save failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, route })
    }

    if (req.method === 'GET') {
      const vehicleId = requestVehicleScope(req.query)
      const fallbackKeys = [cleanVehiclePart(req.query?.fallback), cleanVehiclePart(req.query?.vehicle), cleanVehiclePart(req.query?.reg)].filter(Boolean)

      if (hasSupabase()) {
        try {
          let rows = await supabaseFetch(vehicleId ? `routes?vehicle=eq.${encodeURIComponent(vehicleId)}&order=created_at.desc&limit=1` : 'routes?order=created_at.desc&limit=80')
          if (vehicleId && (!Array.isArray(rows) || !rows.length)) {
            for (const legacyKey of fallbackKeys) {
              rows = await supabaseFetch(`routes?vehicle=eq.${encodeURIComponent(legacyKey)}&order=created_at.desc&limit=1`)
              if (Array.isArray(rows) && rows.length) break
            }
          }
          const routes = (Array.isArray(rows) ? rows : [])
            .filter((row) => !String(row?.vehicle || '').startsWith('ROUTE_LIBRARY::'))
            .map(fromDbRoute)
          return res.status(200).json({ ok: true, route: vehicleId ? routes[0] || null : null, routes })
        } catch (error) {
          console.warn('Supabase route read failed, using memory fallback', error.message)
        }
      }

      const routes = memoryRoutes()
      if (vehicleId) {
        const route = store.get(vehicleId) || fallbackKeys.map((key) => store.get(key)).find(Boolean) || null
        return res.status(200).json({ ok: true, route, routes })
      }
      return res.status(200).json({ ok: true, routes })
    }

    if (req.method === 'DELETE') {
      const vehicleId = requestVehicleScope(req.query)
      const allowAll = String(req.query?.allowAll || '') === 'true'

      // Safety guard for multi-coach operation: a missing vehicle parameter must
      // never wipe every active route. 200+ coaches can be live at once.
      if (!vehicleId && !allowAll) {
        return res.status(400).json({ ok: false, error: 'Missing vehicle id for route delete' })
      }

      if (vehicleId) {
        store.delete(vehicleId)
        legacyVehicleKeys({ fleetNo: req.query?.vehicle, reg: req.query?.reg }).forEach((key) => store.delete(key))
      }
      else store.clear()

      if (hasSupabase()) {
        try {
          const paths = vehicleId
            ? [`routes?vehicle=eq.${encodeURIComponent(vehicleId)}`, ...legacyVehicleKeys({ fleetNo: req.query?.vehicle, reg: req.query?.reg }).map((key) => `routes?vehicle=eq.${encodeURIComponent(key)}`)]
            : ['routes?id=gte.0']
          for (const path of paths) await supabaseFetch(path, { method: 'DELETE' })
        } catch (error) {
          console.warn('Supabase route delete failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, vehicle: vehicleId || 'ALL' })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Routes API failed', details: String(error) })
  }
}
