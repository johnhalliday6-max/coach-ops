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

export function saveCustomRoute(route) {
  if (typeof window === 'undefined') return;
  const current = readCustomRoutes();
  const savedRoute = { ...route, starter: false, updatedAt: new Date().toISOString() };
  const withoutExisting = current.filter((item) => item.id !== savedRoute.id);
  writeCustomRoutes([savedRoute, ...withoutExisting]);
}

export function deleteCustomRoute(id) {
  if (typeof window === 'undefined') return;
  const custom = readCustomRoutes();
  writeCustomRoutes(custom.filter((item) => item.id !== id));
}

export function resetStarterRoutes() {
  // Deprecated: demo/starter routes have been removed. Keep export so old imports do not break.
  return undefined;
}
