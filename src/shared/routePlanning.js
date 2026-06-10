import { vehicleCompany, vehicleLookupParams, vehicleScopeKey } from './vehicleIdentity';

const DEPOT_STARTS = {
  Whitby: { lat: 54.47587, lng: -0.62705 },
  Carnaby: { lat: 54.0845, lng: -0.2478 },
  'Stockton-on-Tees': { lat: 54.5617, lng: -1.3216 },
  'Leeming Bar': { lat: 54.3054, lng: -1.5588 },
  Cleckheaton: { lat: 53.724, lng: -1.713 },
};

function displayRouteDestination(routeInput, fallback) {
  const number = String(routeInput.number || routeInput.routeNumber || '').trim();
  const name = String(routeInput.name || routeInput.routeName || '').trim();
  if (number || name) return `${number}${number && name ? ' - ' : ''}${name}`.trim();
  return fallback;
}

function metresBetween(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const toRad = (value) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function getVehicleStart(vehicle) {
  try {
    const trackingResponse = await fetch(`/api/tracking?${vehicleLookupParams(vehicle)}`);
    const trackingData = await trackingResponse.json();
    const live = trackingData?.vehicle;
    if (live?.lat && live?.lng) return { lat: live.lat, lng: live.lng, label: 'Live vehicle GPS' };
  } catch (error) {
    console.warn('Could not fetch tracking for route start', error);
  }

  const depotStart = DEPOT_STARTS[vehicle.depot] || DEPOT_STARTS.Whitby;
  return { ...depotStart, label: `${vehicle.depot || 'Depot'} fallback start` };
}

export async function clearVehicleRoute(vehicle) {
  // Explicit clear button only. Never call this as part of normal build/push,
  // otherwise one route can briefly vanish while another coach is being operated.
  const vehicleId = vehicleScopeKey(vehicle);
  if (!vehicleId) throw new Error('Missing vehicle for clear');
  await Promise.allSettled([
    fetch(`/api/routes?${vehicleLookupParams(vehicle)}`, { method: 'DELETE' }),
    fetch(`/api/route-pushes?${vehicleLookupParams(vehicle)}`, { method: 'DELETE' }),
  ]);
}

export async function buildVehicleRoute(vehicle, routeInput, options = {}) {
  const directPoints = Array.isArray(routeInput.plotPoints)
    ? routeInput.plotPoints
        .map((point) => ({
          lat: Number(point.lat),
          lng: Number(point.lng),
          label: String(point.label || point.name || 'Route point'),
          type: point.type === 'via' ? 'via' : point.type === 'start' ? 'start' : 'stop',
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];
  const plannedPoints = directPoints[0]?.type === 'start' ? directPoints.slice(1) : directPoints;

  const rawDestination = String(
    routeInput.routeEndLabel || plannedPoints[plannedPoints.length - 1]?.label || routeInput.destination || ''
  ).trim();
  if (!rawDestination) throw new Error('Destination required');
  const displayDestination = displayRouteDestination(routeInput, rawDestination);

  const overrideStart = options.startOverride;
  const liveStart = overrideStart?.lat && overrideStart?.lng
    ? { lat: overrideStart.lat, lng: overrideStart.lng, label: overrideStart.label || 'Phone GPS now' }
    : await getVehicleStart(vehicle);
  const routePoints = plannedPoints.length >= 2
    ? metresBetween(liveStart, plannedPoints[0]) > 60
      ? [{ lat: liveStart.lat, lng: liveStart.lng, label: liveStart.label || 'Live vehicle GPS', type: 'start' }, ...plannedPoints]
      : plannedPoints
    : [];

  const stops = routePoints.length >= 2
    ? routePoints.slice(1, -1).filter((point) => point.type !== 'via' && point.type !== 'start').map((point) => point.label)
    : Array.isArray(routeInput.stops)
      ? routeInput.stops.map((item) => String(item).trim()).filter(Boolean)
      : [];

  const start = routePoints.length >= 2
    ? { lat: routePoints[0].lat, lng: routePoints[0].lng, label: routePoints[0].label }
    : liveStart;

  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startLat: start.lat,
      startLng: start.lng,
      destination: rawDestination,
      stops,
      points: routePoints.length >= 2 ? routePoints : undefined,
      height: vehicle.height,
      width: vehicle.width,
      length: vehicle.length,
      weight: vehicle.weight,
    }),
  });

  const data = await response.json();
  if (!data?.ok) throw new Error(data?.error || 'Route failed');

  return {
    ...data.route,
    fleetNo: vehicle.fleetNo,
    reg: vehicle.reg,
    operator: vehicle.operator,
    category: vehicle.category || vehicle.operator,
    company: vehicleCompany(vehicle),
    vehicleKey: vehicleScopeKey(vehicle),
    destination: displayDestination,
    routeEndLabel: rawDestination,
    stops,
    waypoint: stops.join(' → '),
    startLabel: start.label,
    libraryRouteId: routeInput.id || null,
    routeNumber: routeInput.number || null,
    routeName: routeInput.name || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveActiveRoute(route) {
  const response = await fetch('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(route),
  });
  const data = await response.json();
  if (!data?.ok) throw new Error(data?.error || 'Could not save active route');
  return data.route || route;
}

export async function pushRouteToDriver(vehicle, route) {
  // POST /api/route-pushes replaces pending pushes for this vehicle only.
  await fetch('/api/route-pushes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fleetNo: vehicle.fleetNo,
      reg: vehicle.reg,
      company: vehicleCompany(vehicle),
      vehicleKey: vehicleScopeKey(vehicle),
      route,
      note: `Control pushed route ${route.routeNumber ? `${route.routeNumber} - ` : ''}${route.destination}`,
    }),
  });

  await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fleetNo: vehicle.fleetNo,
      reg: vehicle.reg,
      operator: vehicle.operator,
      category: vehicle.category || vehicle.operator,
      company: vehicleCompany(vehicle),
      vehicleKey: vehicleScopeKey(vehicle),
      depot: vehicle.depot,
      type: 'ROUTE_PUSH',
      source: 'office',
      message: `New route available: ${route.destination}${route.distanceMiles ? ` · ${route.distanceMiles} miles` : ''}`,
    }),
  });
}
