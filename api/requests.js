import { hasSupabase, supabaseFetch } from '../server/lib/storage.js'
import { fleetData } from '../src/data/fleetData.js'
import { bodyVehicleScope, cleanVehiclePart, parseScopedVehicleKey, requestVehicleScope } from '../server/lib/vehicleIdentity.js'

const store = globalThis.__coachOpsRequestsStore || []
globalThis.__coachOpsRequestsStore = store

const ROUTE_MESSAGE_MARKER = '\n__COACH_OPS_ROUTE__='

function encodeRouteMessage(message, route) {
  if (!route) return message || ''
  return `${message || ''}${ROUTE_MESSAGE_MARKER}${JSON.stringify(route)}`
}

function decodeRouteMessage(message) {
  const text = String(message || '')
  const index = text.indexOf(ROUTE_MESSAGE_MARKER)
  if (index < 0) return { message: text, route: null }
  const displayMessage = text.slice(0, index)
  const encodedRoute = text.slice(index + ROUTE_MESSAGE_MARKER.length)
  try {
    return { message: displayMessage, route: JSON.parse(encodedRoute) }
  } catch {
    return { message: displayMessage, route: null }
  }
}

function memoryRequests(vehicleId, includeClosed, fallbackKeys = []) {
  return (vehicleId ? store.filter((item) => [vehicleId, ...fallbackKeys].includes(cleanVehiclePart(item.vehicleKey || item.fleetNo))) : store)
    .filter((item) => includeClosed || item.status !== 'closed')
}

function companyForVehicle(vehicleId) {
  const clean = cleanVehiclePart(vehicleId)
  const parsed = parseScopedVehicleKey(clean)
  const match = fleetData.find((vehicle) => cleanVehiclePart(vehicle.fleetNo) === parsed.fleetNo || cleanVehiclePart(vehicle.reg) === parsed.reg || cleanVehiclePart(vehicle.fleetNo) === clean || cleanVehiclePart(vehicle.reg) === clean)
  return match?.category || match?.operator || 'Unknown'
}

function fromDbIncident(row) {
  const company = companyForVehicle(row.vehicle)
  const parsed = parseScopedVehicleKey(row.vehicle)
  const decoded = decodeRouteMessage(row.message)
  return {
    id: String(row.id),
    vehicleKey: cleanVehiclePart(row.vehicle),
    fleetNo: parsed.fleetNo,
    reg: parsed.reg || parsed.fleetNo,
    operator: company,
    category: company,
    company,
    depot: 'Whitby',
    type: row.type || 'MESSAGE',
    message: decoded.message,
    route: decoded.route,
    source: String(row.type || '').startsWith('ROUTE_PUSH') ? 'office' : 'driver',
    status: String(row.status || 'OPEN').toLowerCase() === 'closed' ? 'closed' : 'new',
    createdAt: row.created_at,
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body || {}
      const vehicleId = bodyVehicleScope(body)
      if (!vehicleId) return res.status(400).json({ ok: false, error: 'Missing vehicle id' })

      const request = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        vehicleKey: vehicleId,
        fleetNo: cleanVehiclePart(body.fleetNo || body.vehicleId || body.reg),
        reg: body.reg || body.fleetNo || body.vehicleId,
        operator: body.operator || body.company || body.category || 'Unknown',
        category: body.category || body.company || body.operator || 'Unknown',
        company: body.company || body.category || body.operator || 'Unknown',
        depot: body.depot || 'Whitby',
        type: body.type || 'MESSAGE',
        message: body.message || '',
        route: body.route || null,
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
              message: encodeRouteMessage(request.message, request.route),
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
      const vehicleId = requestVehicleScope(req.query)
      const fallbackKeys = [cleanVehiclePart(req.query?.vehicle), cleanVehiclePart(req.query?.reg)].filter(Boolean)
      const includeClosed = String(req.query?.includeClosed || '') === 'true'

      if (hasSupabase()) {
        try {
          let query = 'incidents?order=created_at.desc&limit=100'
          if (vehicleId) query = `incidents?vehicle=eq.${encodeURIComponent(vehicleId)}&order=created_at.desc&limit=100`
          let rows = await supabaseFetch(query)
          if (vehicleId && (!Array.isArray(rows) || !rows.length)) {
            for (const legacyKey of fallbackKeys) {
              rows = await supabaseFetch(`incidents?vehicle=eq.${encodeURIComponent(legacyKey)}&order=created_at.desc&limit=100`)
              if (Array.isArray(rows) && rows.length) break
            }
          }
          const requests = (Array.isArray(rows) ? rows : [])
            .map(fromDbIncident)
            .filter((item) => includeClosed || item.status !== 'closed')
          return res.status(200).json({ ok: true, requests })
        } catch (error) {
          console.warn('Supabase request read failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, requests: memoryRequests(vehicleId, includeClosed, fallbackKeys) })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Requests API failed', details: String(error) })
  }
}
