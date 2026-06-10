export const starterRouteLibrary = [];
export const defaultRouteLibrary = [];

function readCustomRoutes() {
  if (typeof window === 'undefined') return [];
  try {
    const custom = JSON.parse(window.localStorage.getItem('coachOpsRouteLibrary') || '[]');
    return Array.isArray(custom) ? custom : [];
  } catch {
    return [];
  }
}

function writeCustomRoutes(routes) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('coachOpsRouteLibrary', JSON.stringify(routes));
}

export function loadRouteLibrary() {
  return readCustomRoutes();
}

export async function loadSharedRouteLibrary(company = 'All') {
  const query = company && company !== 'All' ? `?company=${encodeURIComponent(company)}` : '';
  const response = await fetch(`/api/route-library${query}`, { cache: 'no-store' });
  const data = await response.json();
  if (!data?.ok) throw new Error(data?.error || 'Could not load route library');
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (routes.length) writeCustomRoutes(routes);
  return routes;
}

export function saveCustomRoute(route) {
  if (typeof window === 'undefined') return;
  const current = readCustomRoutes();
  const savedRoute = { ...route, starter: false, updatedAt: new Date().toISOString() };
  const withoutExisting = current.filter((item) => item.id !== savedRoute.id);
  writeCustomRoutes([savedRoute, ...withoutExisting]);
  return savedRoute;
}

export async function saveSharedRoute(route) {
  const savedRoute = saveCustomRoute(route);
  const response = await fetch('/api/route-library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(savedRoute || route),
  });
  const data = await response.json();
  if (!data?.ok) throw new Error(data?.error || 'Could not save route template');
  return data.route || savedRoute || route;
}

export function deleteCustomRoute(id) {
  if (typeof window === 'undefined') return;
  const custom = readCustomRoutes();
  writeCustomRoutes(custom.filter((item) => item.id !== id));
}

export async function deleteSharedRoute(id) {
  deleteCustomRoute(id);
  const response = await fetch(`/api/route-library?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await response.json();
  if (!data?.ok) throw new Error(data?.error || 'Could not delete route template');
}

export function routeCompany(route) {
  return String(route?.company || route?.operator || route?.category || 'Unassigned').trim() || 'Unassigned';
}

export function routeMatchesCompany(route, company) {
  if (!company || company === 'All') return true;
  const wanted = String(company).trim().toLowerCase();
  return [route?.company, route?.category, route?.operator]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}

export function prepareRouteTemplate(route, { reverse = false } = {}) {
  if (!route) return null;
  const sourcePoints = Array.isArray(route.plotPoints) && route.plotPoints.length
    ? route.plotPoints
    : [...(route.stops || []), route.destination].filter(Boolean).map((label) => ({ label }));
  const plotPoints = reverse ? sourcePoints.slice().reverse() : sourcePoints.slice();
  const destination = plotPoints[plotPoints.length - 1]?.label || route.destination;
  const stops = plotPoints.slice(1, -1).filter((point) => point.type !== 'via').map((point) => point.label).filter(Boolean);
  return {
    ...route,
    id: reverse ? `${route.id || route.number}-reverse` : route.id,
    number: route.number,
    name: reverse ? `${route.name || 'Route'} Reverse` : route.name,
    destination,
    routeEndLabel: destination,
    stops,
    plotPoints,
    reversed: reverse,
  };
}

export function resetStarterRoutes() {
  // Deprecated: demo/starter routes have been removed. Keep export so old imports do not break.
  return undefined;
}
