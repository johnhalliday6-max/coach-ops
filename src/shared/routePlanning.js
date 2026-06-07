const DEPOT_STARTS = {
  Whitby: { lat: 54.47587, lng: -0.62705 },
  Carnaby: { lat: 54.0845, lng: -0.2478 },
  'Stockton-on-Tees': { lat: 54.5617, lng: -1.3216 },
  'Leeming Bar': { lat: 54.3054, lng: -1.5588 },
  Cleckheaton: { lat: 53.724, lng: -1.713 },
};

export async function getVehicleStart(vehicle) {
  try {
    const trackingResponse = await fetch(`/api/tracking?vehicle=${encodeURIComponent(vehicle.fleetNo)}`);
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
  await Promise.allSettled([
    fetch(`/api/routes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`, { method: 'DELETE' }),
    fetch(`/api/route-pushes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`, { method: 'DELETE' }),
  ]);
}

export async function buildVehicleRoute(vehicle, routeInput) {
  const destination = String(routeInput.destination || '').trim();
  if (!destination) throw new Error('Destination required');

  const stops = Array.isArray(routeInput.stops)
    ? routeInput.stops.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const start = await getVehicleStart(vehicle);
  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startLat: start.lat,
      startLng: start.lng,
      destination,
      stops,
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
    destination,
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
  await fetch(`/api/route-pushes?vehicle=${encodeURIComponent(vehicle.fleetNo)}`, { method: 'DELETE' }).catch(() => {});
  await fetch('/api/route-pushes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fleetNo: vehicle.fleetNo,
      reg: vehicle.reg,
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
      depot: vehicle.depot,
      type: 'ROUTE_PUSH',
      source: 'office',
      message: `New route available: ${route.routeNumber ? `${route.routeNumber} - ` : ''}${route.stops?.length ? `${route.stops.join(' → ')} → ` : ''}${route.destination}`,
    }),
  });
}
