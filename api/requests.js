const store = globalThis.__coachOpsRequestsStore || []
globalThis.__coachOpsRequestsStore = store

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

      const request = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fleetNo: vehicleId,
        reg: body.reg || vehicleId,
        operator: body.operator || 'Esk Valley',
        depot: body.depot || 'Whitby',
        type: body.type || 'MESSAGE',
        message: body.message || '',
        source: body.source || 'driver',
        status: body.status || 'new',
        createdAt: new Date().toISOString(),
      }

      store.unshift(request)
      if (store.length > 100) store.length = 100

      return res.status(200).json({ ok: true, request })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)
      const requests = vehicleId
        ? store.filter((item) => cleanVehicleId(item.fleetNo) === vehicleId)
        : store

      return res.status(200).json({ ok: true, requests })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Requests API failed',
      details: String(error),
    })
  }
}
