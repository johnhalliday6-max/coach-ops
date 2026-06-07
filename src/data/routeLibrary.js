export const defaultRouteLibrary = [
  {
    id: '315-school-run',
    number: '315',
    name: 'Whitby / Esk Valley School Run',
    operator: 'Esk Valley Coaches',
    category: 'School',
    notes: 'Template route for school contract testing. Edit stops in Routes page before assigning live.',
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
    notes: 'Coach movement to York Racecourse.',
    stops: ['Esk Valley Coaches Whitby YO22 4PU'],
    destination: 'York Racecourse, York',
  },
  {
    id: 'rail-replacement-test',
    number: 'RR1',
    name: 'Rail Replacement Test Route',
    operator: 'Go-Ahead Coach Ops',
    category: 'Rail',
    notes: 'Multi-stop rail replacement demo route.',
    stops: ['Scarborough Railway Station', 'Malton Railway Station'],
    destination: 'York Railway Station',
  },
  {
    id: 'manchester-airport-test',
    number: 'MAN-T2',
    name: 'Manchester Airport T2 Test',
    operator: 'Esk Valley Coaches',
    category: 'Airport',
    notes: 'Whitby to Manchester Airport Terminal 2 with services stop.',
    stops: ['Birch Services M62 Westbound'],
    destination: 'Manchester Airport Terminal 2',
  },
];

export function loadRouteLibrary() {
  if (typeof window === 'undefined') return defaultRouteLibrary;
  try {
    const custom = JSON.parse(window.localStorage.getItem('coachOpsRouteLibrary') || '[]');
    const safeCustom = Array.isArray(custom) ? custom : [];
    const ids = new Set(safeCustom.map((route) => route.id));
    return [...safeCustom, ...defaultRouteLibrary.filter((route) => !ids.has(route.id))];
  } catch {
    return defaultRouteLibrary;
  }
}

export function saveCustomRoute(route) {
  if (typeof window === 'undefined') return;
  const current = loadRouteLibrary().filter((item) => !defaultRouteLibrary.some((base) => base.id === item.id));
  const withoutExisting = current.filter((item) => item.id !== route.id);
  window.localStorage.setItem('coachOpsRouteLibrary', JSON.stringify([route, ...withoutExisting]));
}

export function deleteCustomRoute(id) {
  if (typeof window === 'undefined') return;
  const current = loadRouteLibrary().filter((item) => !defaultRouteLibrary.some((base) => base.id === item.id));
  window.localStorage.setItem('coachOpsRouteLibrary', JSON.stringify(current.filter((item) => item.id !== id)));
}
