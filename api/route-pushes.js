import { hasSupabase, supabaseFetch } from './lib/storage.js'
import { bodyVehicleScope, cleanVehiclePart, legacyVehicleKeys, parseScopedVehicleKey, requestVehicleScope } from './lib/vehicleIdentity.js'

const store = globalThis.__coachOpsRoutePushStore || []
globalThis.__coachOpsRoutePushStore = store

function fromDb(row) {
  const parsed = parseScopedVehicleKey(row.vehicle)
  return {
    id: String(row.id),
    vehicleKey: cleanVehiclePart(row.vehicle),
    fleetNo: parsed.fleetNo,
    reg: parsed.reg,
    route: row.route_data?.route || row.route_data || null,
    routeData: row.route_data || null,
    accepted: Boolean(row.accepted),
    createdAt: row.created_at,
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = bodyVehicleScope(body)
      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })
      if (!body.route) return res.status(400).json({ ok: false, error: 'Missing route payload' })

      // Only one pending office route push per vehicle.
      // Older unaccepted pushes were causing drivers to keep seeing stale routes
      // such as 23031 staying stuck on Manchester Airport T2.
      const replaceKeys = [vehicleId, ...legacyVehicleKeys(body)]
      for (let i = store.length - 1; i >= 0; i -= 1) {
        if (replaceKeys.includes(cleanVehiclePart(store[i]?.vehicleKey || store[i]?.fleetNo)) && !store[i]?.accepted) {
          store.splice(i, 1)
        }
      }

      if (hasSupabase()) {
        try {
          await supabaseFetch(
            `route_pushes?vehicle=eq.${encodeURIComponent(vehicleId)}&accepted=eq.false`,
            { method: 'DELETE' },
          )
          for (const legacyKey of legacyVehicleKeys(body)) {
            await supabaseFetch(
              `route_pushes?vehicle=eq.${encodeURIComponent(legacyKey)}&accepted=eq.false`,
              { method: 'DELETE' },
            )
          }
        } catch (error) {
          console.warn('Supabase old route push delete failed, continuing', error.message)
        }
      }

      const push = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        vehicleKey: vehicleId,
        fleetNo: cleanVehiclePart(body.fleetNo || body.vehicle || body.reg),
        reg: body.reg || body.fleetNo || body.vehicle,
        route: body.route,
        routeData: { route: body.route, note: body.note || '', pushedBy: 'office' },
        accepted: false,
        createdAt: new Date().toISOString(),
      }
      store.unshift(push)
      if (store.length > 100) store.length = 100

      if (hasSupabase()) {
        try {
          const rows = await supabaseFetch('route_pushes', {
            method: 'POST',
            body: JSON.stringify({
              vehicle: vehicleId,
              route_data: push.routeData,
              accepted: false,
              created_at: push.createdAt,
            }),
          })
          if (Array.isArray(rows) && rows[0]?.id) push.id = String(rows[0].id)
        } catch (error) {
          console.warn('Supabase route push save failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, push })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const id = String(body.id || '').trim()
      const accepted = Boolean(body.accepted)
      const item = store.find((push) => push.id === id)
      if (item) item.accepted = accepted

      if (hasSupabase() && /^\d+$/.test(id)) {
        try {
          await supabaseFetch(`route_pushes?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ accepted }),
          })
          return res.status(200).json({ ok: true, push: item || { id, accepted } })
        } catch (error) {
          console.warn('Supabase route push patch failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, push: item || { id, accepted } })
    }

    if (req.method === 'GET') {
      const vehicleId = requestVehicleScope(req.query)
      const fallbackKeys = [cleanVehiclePart(req.query?.vehicle), cleanVehiclePart(req.query?.reg)].filter(Boolean)
      const includeAccepted = String(req.query?.includeAccepted || '') === 'true'

      if (hasSupabase()) {
        try {
          let query = includeAccepted
            ? 'route_pushes?order=created_at.desc&limit=50'
            : 'route_pushes?accepted=eq.false&order=created_at.desc&limit=50'
          if (vehicleId) query = includeAccepted
            ? `route_pushes?vehicle=eq.${encodeURIComponent(vehicleId)}&order=created_at.desc&limit=50`
            : `route_pushes?vehicle=eq.${encodeURIComponent(vehicleId)}&accepted=eq.false&order=created_at.desc&limit=50`
          let rows = await supabaseFetch(query)
          if (vehicleId && (!Array.isArray(rows) || !rows.length)) {
            for (const legacyKey of fallbackKeys) {
              rows = await supabaseFetch(includeAccepted
                ? `route_pushes?vehicle=eq.${encodeURIComponent(legacyKey)}&order=created_at.desc&limit=50`
                : `route_pushes?vehicle=eq.${encodeURIComponent(legacyKey)}&accepted=eq.false&order=created_at.desc&limit=50`)
              if (Array.isArray(rows) && rows.length) break
            }
          }
          const pushes = (Array.isArray(rows) ? rows : [])
            .map(fromDb)
            .filter((push) => includeAccepted || !push.accepted)
          return res.status(200).json({ ok: true, push: pushes[0] || null, pushes })
        } catch (error) {
          console.warn('Supabase route push read failed, using memory fallback', error.message)
        }
      }

      const pushes = store
        .filter((push) => (!vehicleId || [vehicleId, ...fallbackKeys].includes(cleanVehiclePart(push.vehicleKey || push.fleetNo))))
        .filter((push) => includeAccepted || !push.accepted)
      return res.status(200).json({ ok: true, push: pushes[0] || null, pushes })
    }

    if (req.method === 'DELETE') {
      const vehicleId = requestVehicleScope(req.query)
      const id = String(req.query?.id || '').trim()

      if (id) {
        const index = store.findIndex((push) => String(push.id) === id)
        if (index >= 0) store.splice(index, 1)
        if (hasSupabase() && /^\d+$/.test(id)) {
          try { await supabaseFetch(`route_pushes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch {
            // Memory fallback has already removed the push.
          }
        }
        return res.status(200).json({ ok: true, deleted: id })
      }

      if (vehicleId) {
        for (let i = store.length - 1; i >= 0; i -= 1) {
          if ([vehicleId, ...legacyVehicleKeys({ fleetNo: req.query?.vehicle, reg: req.query?.reg })].includes(cleanVehiclePart(store[i]?.vehicleKey || store[i]?.fleetNo))) store.splice(i, 1)
        }
        if (hasSupabase()) {
          try {
            await supabaseFetch(`route_pushes?vehicle=eq.${encodeURIComponent(vehicleId)}`, { method: 'DELETE' })
            for (const legacyKey of legacyVehicleKeys({ fleetNo: req.query?.vehicle, reg: req.query?.reg })) {
              await supabaseFetch(`route_pushes?vehicle=eq.${encodeURIComponent(legacyKey)}`, { method: 'DELETE' })
            }
          } catch {
            // Memory fallback has already cleared matching pushes.
          }
        }
        return res.status(200).json({ ok: true, vehicle: vehicleId, cleared: true })
      }

      // Safety guard: never clear every coach's pending push by accident.
      // Use ?allowAll=true only for a deliberate admin reset.
      if (String(req.query?.allowAll || '') !== 'true') {
        return res.status(400).json({ ok: false, error: 'Missing vehicle id for route push delete' })
      }

      store.length = 0
      if (hasSupabase()) {
        try { await supabaseFetch('route_pushes?id=gte.0', { method: 'DELETE' }) } catch {
          // Memory fallback has already cleared all pushes.
        }
      }
      return res.status(200).json({ ok: true, cleared: true })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Route push API failed', details: String(error) })
  }
}
