import { hasSupabase, supabaseFetch } from './_supabase.js'

const store = globalThis.__coachOpsTrackingStore || new Map()
globalThis.__coachOpsTrackingStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

function fromVehicleRow(row) {
  if (!row) return null
  return {
    fleetNo: row.fleet_no || row.reg || '23031',
    reg: row.reg || row.fleet_no || 'YJ72 CGG',
    operator: 'Esk Valley',
    depot: 'Whitby',
    lat: row.lat,
    lng: row.lng,
    speedMps: row.speed == null ? null : Number(row.speed) / 2.23694,
    source: 'supabase',
    updatedAt: row.updated_at,
  }
}

async function saveToSupabase(record) {
  return supabaseFetch('vehicles', {
    method: 'POST',
    body: JSON.stringify({
      fleet_no: record.fleetNo,
      reg: record.reg,
      driver_name: 'Driver Phone',
      status: 'On Route',
      lat: record.lat,
      lng: record.lng,
      speed: record.speedMps == null ? null : Math.max(0, Math.round(Number(record.speedMps) * 2.23694)),
      updated_at: record.updatedAt,
    }),
  })
}

async function latestFromSupabase(vehicleId) {
  const filter = vehicleId ? `&fleet_no=eq.${encodeURIComponent(vehicleId)}` : ''
  const rows = await supabaseFetch(`vehicles?select=*&order=updated_at.desc${filter}&limit=50`, {
    method: 'GET',
    headers: { Prefer: undefined },
  })

  const seen = new Set()
  const vehicles = []
  for (const row of rows || []) {
    const id = cleanVehicleId(row.fleet_no || row.reg)
    if (!id || seen.has(id)) continue
    seen.add(id)
    vehicles.push(fromVehicleRow(row))
  }

  return {
    vehicle: vehicleId ? vehicles[0] || null : null,
    vehicles,
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg)

      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const lat = Number(body.lat)
      const lng = Number(body.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ ok: false, error: 'Invalid coordinates' })
      }

      const record = {
        fleetNo: vehicleId,
        reg: body.reg || vehicleId,
        operator: body.operator || 'Esk Valley',
        depot: body.depot || 'Whitby',
        lat,
        lng,
        accuracy: Number(body.accuracy || 0),
        speedMps: body.speedMps == null ? null : Number(body.speedMps),
        heading: body.heading == null ? null : Number(body.heading),
        source: hasSupabase() ? 'supabase' : 'memory',
        updatedAt: new Date().toISOString(),
      }

      store.set(vehicleId, record)
      if (hasSupabase()) await saveToSupabase(record)

      return res.status(200).json({ ok: true, vehicle: record, persistent: hasSupabase() })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)

      if (hasSupabase()) {
        const result = await latestFromSupabase(vehicleId)
        return res.status(200).json({ ok: true, ...result, persistent: true })
      }

      const vehicles = Array.from(store.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      if (vehicleId) return res.status(200).json({ ok: true, vehicle: store.get(vehicleId) || null, vehicles, persistent: false })
      return res.status(200).json({ ok: true, vehicles, persistent: false })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Tracking API failed', details: String(error) })
  }
}
