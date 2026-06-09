function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function makeBbox(query) {
  const raw = String(query?.bbox || '').trim()
  if (raw) {
    const parts = raw.split(',').map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) return parts.join(',')
  }

  const lat = numberOrNull(query?.lat) ?? 54.3
  const lng = numberOrNull(query?.lng) ?? -0.6
  const span = clamp(numberOrNull(query?.span) ?? 0.6, 0.08, 3)
  const minLon = lng - span
  const minLat = lat - span
  const maxLon = lng + span
  const maxLat = lat + span
  return [minLon, minLat, maxLon, maxLat].map((n) => Number(n).toFixed(5)).join(',')
}

function parseIncident(incident, index) {
  const p = incident?.properties || incident || {}
  const geometry = incident?.geometry || p?.geometry || {}
  let coord = null

  if (Array.isArray(geometry?.coordinates)) {
    if (typeof geometry.coordinates[0] === 'number') coord = geometry.coordinates
    else if (Array.isArray(geometry.coordinates[0])) coord = geometry.coordinates[0]
  }

  const lat = numberOrNull(p.latitude) ?? numberOrNull(p.lat) ?? numberOrNull(p.y) ?? numberOrNull(p?.p?.y) ?? numberOrNull(coord?.[1])
  const lng = numberOrNull(p.longitude) ?? numberOrNull(p.lon) ?? numberOrNull(p.lng) ?? numberOrNull(p.x) ?? numberOrNull(p?.p?.x) ?? numberOrNull(coord?.[0])

  const iconCategory = p.iconCategory ?? p.category ?? p.type ?? p.incidentType
  const delay = p.delay ?? p.delaySeconds ?? p.delayInSeconds
  const road = p.roadNumbers?.[0] || p.roadNumber || p.roadName || p.from || 'Traffic alert'
  const description = p.description || p.events?.[0]?.description || p.cause || p.title || p.message || 'TomTom live traffic incident'

  return {
    id: p.id || p.incidentId || `tomtom-${index}`,
    source: 'TomTom',
    road,
    title: description,
    detail: description,
    type: String(iconCategory || 'traffic'),
    delaySeconds: numberOrNull(delay),
    magnitude: p.magnitudeOfDelay ?? p.magnitude ?? null,
    lat,
    lng,
  }
}

function parseIncidents(data) {
  const raw = data?.incidents || data?.tm?.poi || data?.features || []
  return (Array.isArray(raw) ? raw : [])
    .map(parseIncident)
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .slice(0, 80)
}

function parseFlowPoints(query) {
  const raw = String(query?.points || '').trim()
  const points = []

  if (raw) {
    raw.split(';').forEach((pair) => {
      const [lat, lng] = pair.split(',').map(numberOrNull)
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng })
    })
  }

  const lat = numberOrNull(query?.lat)
  const lng = numberOrNull(query?.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) points.unshift({ lat, lng })

  const seen = new Set()
  return points.filter((point) => {
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)
}

async function fetchSingleFlow(key, point) {
  const url = new URL('https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json')
  url.searchParams.set('point', `${point.lat},${point.lng}`)
  url.searchParams.set('unit', 'MPH')
  url.searchParams.set('key', key)

  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  const data = await response.json()
  const flow = data?.flowSegmentData || null
  if (!flow) return null

  const currentSpeed = numberOrNull(flow.currentSpeed)
  const freeFlowSpeed = numberOrNull(flow.freeFlowSpeed)
  const ratio = currentSpeed != null && freeFlowSpeed ? currentSpeed / freeFlowSpeed : 1

  return {
    lat: point.lat,
    lng: point.lng,
    currentSpeed,
    freeFlowSpeed,
    currentTravelTime: flow.currentTravelTime ?? null,
    freeFlowTravelTime: flow.freeFlowTravelTime ?? null,
    confidence: flow.confidence ?? null,
    roadClosure: Boolean(flow.roadClosure),
    congestionRatio: ratio,
  }
}

async function fetchFlow(key, query) {
  const points = parseFlowPoints(query)
  if (!points.length) return { flow: null, flows: [] }

  const results = await Promise.allSettled(points.map((point) => fetchSingleFlow(key, point)))
  const flows = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)

  const worst = flows.slice().sort((a, b) => {
    if (a.roadClosure !== b.roadClosure) return a.roadClosure ? -1 : 1
    return (a.congestionRatio ?? 1) - (b.congestionRatio ?? 1)
  })[0] || null

  return { flow: worst, flows, sampledPoints: points.length }
}

export default async function handler(req, res) {
  try {
    const key = process.env.TOMTOM_API_KEY || process.env.VITE_TOMTOM_API_KEY || process.env.TOMTOM_KEY
    if (!key) return res.status(200).json({ ok: false, error: 'Missing TomTom API key', incidents: [], flow: null })

    const bbox = makeBbox(req.query)
    const url = new URL(`https://api.tomtom.com/traffic/services/4/incidentDetails/s3/${bbox}/10/-1/json`)
    url.searchParams.set('key', key)
    url.searchParams.set('language', 'en-GB')

    const [incidentsResult, flow] = await Promise.allSettled([
      fetch(url, { headers: { Accept: 'application/json' } }).then(async (response) => {
        if (!response.ok) throw new Error(`TomTom incidents ${response.status}`)
        return response.json()
      }),
      fetchFlow(key, req.query),
    ])

    const incidentData = incidentsResult.status === 'fulfilled' ? incidentsResult.value : null
    const incidents = parseIncidents(incidentData)
    const flowData = flow.status === 'fulfilled' ? flow.value : { flow: null, flows: [] }

    return res.status(200).json({
      ok: true,
      source: 'TomTom',
      bbox,
      count: incidents.length,
      incidents,
      flow: flowData.flow || null,
      flows: flowData.flows || [],
      diagnostics: {
        status: flowData.flow ? 'connected' : 'no-flow',
        sampledPoints: flowData.sampledPoints || 0,
        returnedFlows: Array.isArray(flowData.flows) ? flowData.flows.length : 0,
        lastCheck: new Date().toISOString(),
        bbox,
      },
      warning: incidentsResult.status === 'rejected' ? incidentsResult.reason?.message : null,
    })
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'TomTom traffic failed', details: String(error), incidents: [], flow: null })
  }
}
