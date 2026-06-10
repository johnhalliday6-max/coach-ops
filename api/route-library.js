import { hasSupabase, supabaseFetch } from '../server/lib/storage.js'

const LIBRARY_PREFIX = 'ROUTE_LIBRARY::'
const store = globalThis.__coachOpsRouteLibraryStore || new Map()
globalThis.__coachOpsRouteLibraryStore = store

function clean(value) {
  return String(value || '').trim()
}

function libraryKey(route) {
  const id = clean(route.id || `${route.number || 'route'}-${route.name || Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${LIBRARY_PREFIX}${clean(route.company || route.operator || 'Unassigned')}::${id || Date.now()}`
}

function normaliseRoute(route = {}) {
  const plotPoints = Array.isArray(route.plotPoints) ? route.plotPoints : []
  return {
    id: clean(route.id || clean(route.vehicleKey || '').split('::').pop() || `${route.number || 'route'}-${route.name || Date.now()}`),
    number: clean(route.number || route.routeNumber),
    name: clean(route.name || route.routeName),
    operator: clean(route.operator || route.company || 'Unassigned'),
    company: clean(route.company || route.category || route.operator || 'Unassigned'),
    category: clean(route.category || 'Route'),
    destination: clean(route.destination || plotPoints[plotPoints.length - 1]?.label),
    stops: Array.isArray(route.stops) ? route.stops : [],
    plotPoints,
    notes: clean(route.notes),
    updatedAt: route.updatedAt || new Date().toISOString(),
  }
}

function toDbRoute(route) {
  return {
    vehicle: libraryKey(route),
    destination: route.destination || route.name || 'Route template',
    stops: { route, stops: route.stops || [], waypoints: [] },
    distance: null,
    duration: null,
    accepted: false,
    created_at: route.updatedAt || new Date().toISOString(),
  }
}

function fromDbRoute(row) {
  const stored = row?.stops?.route || {}
  return normaliseRoute({
    ...stored,
    vehicleKey: row.vehicle,
    destination: stored.destination || row.destination,
    updatedAt: stored.updatedAt || row.created_at,
  })
}

function matchesCompany(route, company) {
  if (!company || company === 'All') return true
  const wanted = clean(company).toLowerCase()
  return [route.company, route.category, route.operator]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean)
    .includes(wanted)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  try {
    if (req.method === 'GET') {
      const company = clean(req.query?.company)
      if (hasSupabase()) {
        try {
          const rows = await supabaseFetch('routes?vehicle=like.ROUTE_LIBRARY*&order=created_at.desc&limit=200')
          const routes = (Array.isArray(rows) ? rows : []).map(fromDbRoute).filter((route) => matchesCompany(route, company))
          return res.status(200).json({ ok: true, routes })
        } catch (error) {
          console.warn('Supabase route library read failed, using memory fallback', error.message)
        }
      }

      const routes = Array.from(store.values())
        .map(normaliseRoute)
        .filter((route) => matchesCompany(route, company))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      return res.status(200).json({ ok: true, routes })
    }

    if (req.method === 'POST') {
      const route = normaliseRoute(req.body || {})
      if (!route.number || !route.name || route.plotPoints.length < 2) {
        return res.status(400).json({ ok: false, error: 'Route number, name and at least two points are required' })
      }

      route.updatedAt = new Date().toISOString()
      store.set(route.id, route)

      if (hasSupabase()) {
        try {
          const key = libraryKey(route)
          await supabaseFetch(`routes?vehicle=eq.${encodeURIComponent(key)}`, { method: 'DELETE' })
          await supabaseFetch('routes', {
            method: 'POST',
            body: JSON.stringify(toDbRoute(route)),
          })
        } catch (error) {
          console.warn('Supabase route library save failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, route })
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query?.id)
      if (!id) return res.status(400).json({ ok: false, error: 'Missing route id' })
      store.delete(id)

      if (hasSupabase()) {
        try {
          const rows = await supabaseFetch(`routes?vehicle=like.ROUTE_LIBRARY*&select=vehicle,stops`)
          const match = (Array.isArray(rows) ? rows : []).find((row) => fromDbRoute(row).id === id)
          if (match?.vehicle) await supabaseFetch(`routes?vehicle=eq.${encodeURIComponent(match.vehicle)}`, { method: 'DELETE' })
        } catch (error) {
          console.warn('Supabase route library delete failed, using memory fallback', error.message)
        }
      }

      return res.status(200).json({ ok: true, id })
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Route library API failed', details: String(error) })
  }
}
