export const starterRouteLibrary = [
  {
    id: '315-school-run',
    number: '315',
    name: 'Whitby / Esk Valley School Run',
    operator: 'Esk Valley Coaches',
    category: 'School',
    notes: 'Starter template. Edit stops before assigning live.',
    stops: [
      'Esk Valley Coaches Whitby YO22 4PU',
      'Sleights, North Yorkshire',
      'Ruswarp, Whitby',
    ],
    destination: 'Caedmon College Whitby',
  },
  {
    id: 'york-races-shuttle',
    number: 'YR1',
    name: 'York Racecourse Shuttle',
    operator: 'Esk Valley Coaches',
    category: 'Event',
    notes: 'Starter coach movement to York Racecourse.',
    stops: ['Esk Valley Coaches Whitby YO22 4PU'],
    destination: 'York Racecourse, York',
  },
  {
    id: 'rail-replacement-test',
    number: 'RR1',
    name: 'Rail Replacement Test Route',
    operator: 'Go-Ahead Coach Ops',
    category: 'Rail',
    notes: 'Starter rail replacement route. Use as a template then edit.',
    stops: ['Scarborough Railway Station', 'Malton Railway Station'],
    destination: 'York Railway Station',
  },
  {
    id: 'manchester-airport-test',
    number: 'MAN-T2',
    name: 'Manchester Airport T2 Test',
    operator: 'Esk Valley Coaches',
    category: 'Airport',
    notes: 'Starter Whitby to Manchester Airport Terminal 2 with services stop.',
    stops: ['Birch Services M62 Westbound'],
    destination: 'Manchester Airport Terminal 2',
  },
];

export const defaultRouteLibrary = starterRouteLibrary;

function readCustomRoutes() {
  if (typeof window === 'undefined') return [];
  try {
    const custom = JSON.parse(window.localStorage.getItem('coachOpsRouteLibrary') || '[]');
    return Array.isArray(custom) ? custom : [];
  } catch {
    return [];
  }
}

function readHiddenStarterIds() {
  if (typeof window === 'undefined') return [];
  try {
    const hidden = JSON.parse(window.localStorage.getItem('coachOpsHiddenStarterRoutes') || '[]');
    return Array.isArray(hidden) ? hidden : [];
  } catch {
    return [];
  }
}

function writeCustomRoutes(routes) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('coachOpsRouteLibrary', JSON.stringify(routes));
}

function writeHiddenStarterIds(ids) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('coachOpsHiddenStarterRoutes', JSON.stringify(Array.from(new Set(ids))));
}

export function loadRouteLibrary() {
  const custom = readCustomRoutes();
  const hidden = new Set(readHiddenStarterIds());
  const customIds = new Set(custom.map((route) => route.id));
  const starters = starterRouteLibrary
    .filter((route) => !hidden.has(route.id) && !customIds.has(route.id))
    .map((route) => ({ ...route, starter: true }));
  return [...custom, ...starters];
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
  const customWasRemoved = custom.some((item) => item.id === id);
  writeCustomRoutes(custom.filter((item) => item.id !== id));

  if (!customWasRemoved && starterRouteLibrary.some((item) => item.id === id)) {
    writeHiddenStarterIds([...readHiddenStarterIds(), id]);
  }
}

export function resetStarterRoutes() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('coachOpsHiddenStarterRoutes');
}
