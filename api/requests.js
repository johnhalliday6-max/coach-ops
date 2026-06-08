import { hasSupabase, supabaseFetch } from './lib/storage.js'
import { fleetData } from '../src/data/fleetData.js'

const store = globalThis.__coachOpsRequestsStore || []
globalThis.__coachOpsRequestsStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

function memoryRequests(vehicleId, includeClosed) {
  return (vehicleId ? store.filter((item) => cleanVehicleId(item.fleetNo) === vehicleId) : store)
    .filter((item) => includeClosed || item.status !== 'closed')
}

function companyForVehicle(vehicleId) {
  const clean = cleanVehicleId(vehicleId)
  const match = fleetData.find((vehicle) => cleanVehicleId(vehicle.fleetNo) === clean || cleanVehicleId(vehicle.reg) === clean)
  return match?.category || match?.operator || 'Unknown'
}

function fromDbIncident(row) {
  const company = companyForVehicle(row.vehicle)
  return {
    id: String(row.id),
    fleetNo: cleanVehicleId(row.vehicle),
    reg: cleanVehicleId(row.vehicle),
    operator: company,
    category: company,
    company,
    depot: 'Whitby',
    type: row.type || 'MESSAGE',
    message: row.message || '',
    source: String(row.type || '').startsWith('ROUTE_PUSH') ? 'office' : 'driver',
    status: String(row.status || 'OPEN').toLowerCase() === 'closed' ? 'closed' : 'new',
    createdAt: row.created_at,
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = cleanVehicleId(body.fleetNo || body.vehicleId || body.reg)
      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const request = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fleetNo: vehicleId,
        reg: body.reg || vehicleId,
        operator: body.operator || body.company || body.category || 'Unknown',
        category: body.category || body.company || body.operator || 'Unknown',
        company: body.company || body.category || body.operator || 'Unknown',
        depot: body.depot || 'Whitby',
        type: body.type || 'MESSAGE',
        message: body.message || '',
        source: body.source || 'driver',
        status: body.status || 'new',
        createdAt: new Date().toISOString(),
      }

      store.unshift(request)
      if (store.length > 100) store.length = 100

      if (hasSupabase()) {
        try {
          const rows = await supabaseFetch('incidents', {
            method: 'POST',
            body: JSON.stringify({
              vehicle: vehicleId,
              type: request.type,
              message: request.message,
              status: request.status === 'closed' ? 'CLOSED' : 'OPEN',
              created_at: request.createdAt,
            }),
          })
          if (Array.isArray(rows) && rows[0]?.id) request.id = String(rows[0].id)
        } catch (error) {
          console.warn('Supabase request save failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, request })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const id = String(body.id || '').trim()
      const status = String(body.status || 'closed').trim()

      const item = store.find((request) => request.id === id)
      if (item) {
        item.status = status
        item.closedAt = new Date().toISOString()
      }

      if (hasSupabase() && /^\d+$/.test(id)) {
        try {
          await supabaseFetch(`incidents?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: status === 'closed' ? 'CLOSED' : status.toUpperCase() }),
          })
          return res.status(200).json({ ok: true, request: item || { id, status } })
        } catch (error) {
          console.warn('Supabase request patch failed, using memory fallback', error.message)
        }
      }

      if (!item) return res.status(404).json({ ok: false, error: 'Request not found' })
      return res.status(200).json({ ok: true, request: item })
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '').trim()
      if (!id) {
        store.length = 0
        return res.status(200).json({ ok: true, cleared: true })
      }

      const index = store.findIndex((request) => request.id === id)
      if (index >= 0) store.splice(index, 1)
      return res.status(200).json({ ok: true, deleted: id })
    }

    if (req.method === 'GET') {
      const vehicleId = cleanVehicleId(req.query?.vehicle)
      const includeClosed = String(req.query?.includeClosed || '') === 'true'

      if (hasSupabase()) {
        try {
          let query = 'incidents?order=created_at.desc&limit=100'
          if (vehicleId) query = `incidents?vehicle=eq.${encodeURIComponent(vehicleId)}&order=created_at.desc&limit=100`
          const rows = await supabaseFetch(query)
          const requests = (Array.isArray(rows) ? rows : [])
            .map(fromDbIncident)
            .filter((item) => includeClosed || item.status !== 'closed')
          return res.status(200).json({ ok: true, requests })
        } catch (error) {
          console.warn('Supabase request read failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, requests: memoryRequests(vehicleId, includeClosed) })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Requests API failed', details: String(error) })
  }
}
