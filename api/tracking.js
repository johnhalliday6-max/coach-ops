import { hasSupabase, supabaseFetch } from './lib/storage.js'
import { bodyVehicleScope, cleanVehiclePart, legacyVehicleKeys, parseScopedVehicleKey, requestVehicleScope, vehicleCompany } from './lib/vehicleIdentity.js'

const store = globalThis.__coachOpsTrackingStore || new Map()
globalThis.__coachOpsTrackingStore = store

function memoryVehicles() {
  return Array.from(store.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = bodyVehicleScope(body)

      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const lat = Number(body.lat)
      const lng = Number(body.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ ok: false, error: 'Invalid coordinates' })
      }

      const record = {
        vehicleKey: vehicleId,
        fleetNo: cleanVehiclePart(body.fleetNo || body.vehicleId || body.reg),
        reg: body.reg || body.fleetNo || body.vehicleId,
        operator: body.operator || body.company || body.category || 'Esk Valley',
        category: body.category || body.company || body.operator || 'Esk Valley',
        company: body.company || body.category || body.operator || vehicleCompany(body),
        depot: body.depot || 'Whitby',
        lat,
        lng,
        accuracy: Number(body.accuracy || 0),
        speedMps: body.speedMps == null ? null : Number(body.speedMps),
        heading: body.heading == null ? null : Number(body.heading),
        source: 'driver-phone',
        updatedAt: new Date().toISOString(),
      }

      store.set(vehicleId, record)

      if (hasSupabase()) {
        try {
          const dbRecord = {
            fleet_no: vehicleId,
            reg: record.reg,
            status: 'TRACKING',
            lat,
            lng,
            speed: record.speedMps == null ? null : Math.round(record.speedMps * 2.23694),
            updated_at: record.updatedAt,
          }

          let existing = await supabaseFetch(`vehicles?fleet_no=eq.${encodeURIComponent(vehicleId)}&select=id&order=updated_at.desc&limit=1`)
          if ((!Array.isArray(existing) || !existing[0]?.id)) {
            for (const legacyKey of legacyVehicleKeys(body)) {
              existing = await supabaseFetch(`vehicles?fleet_no=eq.${encodeURIComponent(legacyKey)}&select=id&order=updated_at.desc&limit=1`)
              if (Array.isArray(existing) && existing[0]?.id) break
            }
          }

          if (Array.isArray(existing) && existing[0]?.id) {
            await supabaseFetch(`vehicles?id=eq.${existing[0].id}`, {
              method: 'PATCH',
              body: JSON.stringify(dbRecord),
            })
          } else {
            await supabaseFetch('vehicles', {
              method: 'POST',
              body: JSON.stringify(dbRecord),
            })
          }
        } catch (error) {
          console.warn('Supabase tracking save failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, vehicle: record })
    }

    if (req.method === 'GET') {
      const vehicleId = requestVehicleScope(req.query)
      const fallbackKeys = [cleanVehiclePart(req.query?.vehicle), cleanVehiclePart(req.query?.reg)].filter(Boolean)

      if (hasSupabase()) {
        try {
          let rows = await supabaseFetch(vehicleId ? `vehicles?fleet_no=eq.${encodeURIComponent(vehicleId)}&order=updated_at.desc&limit=1` : 'vehicles?order=updated_at.desc&limit=50')
          if (vehicleId && (!Array.isArray(rows) || !rows.length)) {
            for (const legacyKey of fallbackKeys) {
              rows = await supabaseFetch(`vehicles?fleet_no=eq.${encodeURIComponent(legacyKey)}&order=updated_at.desc&limit=1`)
              if (Array.isArray(rows) && rows.length) break
            }
          }
          const vehicles = (Array.isArray(rows) ? rows : []).map((row) => ({
            vehicleKey: cleanVehiclePart(row.fleet_no),
            fleetNo: parseScopedVehicleKey(row.fleet_no).fleetNo,
            reg: row.reg || parseScopedVehicleKey(row.fleet_no).reg || parseScopedVehicleKey(row.fleet_no).fleetNo,
            operator: 'Esk Valley',
            depot: 'Whitby',
            lat: row.lat,
            lng: row.lng,
            speedMps: row.speed == null ? null : Number(row.speed) / 2.23694,
            speedMph: row.speed,
            source: 'supabase',
            updatedAt: row.updated_at,
          }))
          return res.status(200).json({ ok: true, vehicle: vehicleId ? vehicles[0] || null : null, vehicles })
        } catch (error) {
          console.warn('Supabase tracking read failed, using memory fallback', error.message)
        }
      }

      const vehicles = memoryVehicles()
      if (vehicleId) {
        const vehicle = store.get(vehicleId) || fallbackKeys.map((key) => store.get(key)).find(Boolean) || null
        return res.status(200).json({ ok: true, vehicle, vehicles })
      }
      return res.status(200).json({ ok: true, vehicles })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Tracking API failed', details: String(error) })
  }
}
