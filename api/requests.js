import { hasSupabase, supabaseFetch } from './_supabase.js'

const store = globalThis.__coachOpsRequestsStore || []
globalThis.__coachOpsRequestsStore = store

function cleanVehicleId(value) {
  return String(value || '').trim().toUpperCase()
}

function fromIncidentRow(row) {
  if (!row) return null
  return {
    id: String(row.id),
    fleetNo: row.vehicle,
    reg: row.vehicle,
    operator: 'Esk Valley',
    depot: 'Whitby',
    type: row.type || 'MESSAGE',
    message: row.message || '',
    source: row.type === 'ROUTE_PUSH' ? 'office' : 'driver',
    status: String(row.status || 'OPEN').toLowerCase() === 'closed' ? 'closed' : 'new',
    createdAt: row.created_at,
  }
}

async function saveIncident(request) {
  return supabaseFetch('incidents', {
    method: 'POST',
    body: JSON.stringify({
      vehicle: request.fleetNo,
      type: request.type,
      message: request.message,
      status: request.status === 'closed' ? 'closed' : 'OPEN',
      created_at: request.createdAt,
    }),
  })
}

async function getIncidents(vehicleId, includeClosed) {
  const vehicleFilter = vehicleId ? `&vehicle=eq.${encodeURIComponent(vehicleId)}` : ''
  const statusFilter = includeClosed ? '' : '&status=neq.closed'
  const rows = await supabaseFetch(`incidents?select=*&order=created_at.desc${vehicleFilter}${statusFilter}&limit=100`, {
    method: 'GET',
    headers: { Prefer: undefined },
  })
  return (rows || []).map(fromIncidentRow).filter(Boolean)
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
      if (hasSupabase()) {
        const rows = await saveIncident(request)
        const saved = Array.isArray(rows) && rows[0] ? fromIncidentRow(rows[0]) : request
        return res.status(200).json({ ok: true, request: saved, persistent: true })
      }

      return res.status(200).json({ ok: true, request, persistent: false })
    }

    if (req.method === 'PATCH') {
      const body = req.body || {}
      const id = String(body.id || '').trim()
      const status = String(body.status || 'closed').trim()

      if (hasSupabase()) {
        const rows = await supabaseFetch(`incidents?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        })
        const saved = Array.isArray(rows) && rows[0] ? fromIncidentRow(rows[0]) : null
        return res.status(200).json({ ok: true, request: saved })
      }

      const item = store.find((request) => request.id === id)
      if (!item) return res.status(404).json({ ok: false, error: 'Request not found' })
      item.status = status
      item.closedAt = new Date().toISOString()
      return res.status(200).json({ ok: true, request: item })
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '').trim()
      if (hasSupabase()) {
        const path = id ? `incidents?id=eq.${encodeURIComponent(id)}` : 'incidents?id=gte.0'
        await supabaseFetch(path, { method: 'DELETE' })
        return res.status(200).json({ ok: true, deleted: id || 'all' })
      }

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
        const requests = await getIncidents(vehicleId, includeClosed)
        return res.status(200).json({ ok: true, requests, persistent: true })
      }

      const requests = (vehicleId ? store.filter((item) => cleanVehicleId(item.fleetNo) === vehicleId) : store)
        .filter((item) => includeClosed || item.status !== 'closed')

      return res.status(200).json({ ok: true, requests, persistent: false })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Requests API failed', details: String(error) })
  }
}
