const store = globalThis.__coachOpsTrackingStore || new Map()
globalThis.__coachOpsTrackingStore = store

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
        source: 'driver-phone',
        updatedAt: new Date().toISOString(),
      }

      store.set(vehicleId, record)

      return res.status(200).json({ ok: true, vehicle: record })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)
      const vehicles = Array.from(store.values()).sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      )

      if (vehicleId) {
        const vehicle = store.get(vehicleId) || null
        return res.status(200).json({ ok: true, vehicle, vehicles })
      }

      return res.status(200).json({ ok: true, vehicles })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Tracking API failed',
      details: String(error),
    })
  }
}
