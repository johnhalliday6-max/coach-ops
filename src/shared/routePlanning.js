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

export async function buildVehicleRoute(vehicle, routeInput) {
  const directPoints = Array.isArray(routeInput.plotPoints)
    ? routeInput.plotPoints
        .map((point) => ({
          lat: Number(point.lat),
          lng: Number(point.lng),
          label: String(point.label || point.name || 'Route point'),
          type: point.type === 'via' ? 'via' : 'stop',
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];

  const rawDestination = String(
    routeInput.destination || directPoints[directPoints.length - 1]?.label || ''
  ).trim();
  if (!rawDestination) throw new Error('Destination required');
  const displayDestination = displayRouteDestination(routeInput, rawDestination);

  const stops = directPoints.length >= 2
    ? directPoints.slice(1, -1).filter((point) => point.type !== 'via').map((point) => point.label)
    : Array.isArray(routeInput.stops)
      ? routeInput.stops.map((item) => String(item).trim()).filter(Boolean)
      : [];

  const start = directPoints.length >= 2
    ? { lat: directPoints[0].lat, lng: directPoints[0].lng, label: directPoints[0].label }
    : await getVehicleStart(vehicle);

  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startLat: start.lat,
      startLng: start.lng,
      destination: rawDestination,
      stops,
      points: directPoints.length >= 2 ? directPoints : undefined,
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
