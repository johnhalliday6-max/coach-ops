export const savedRoutes = [
  {
    id: 'scarborough-school-run-demo',
    name: 'Scarborough School Run Demo',
    operator: 'Shared / Cover Route',
    type: 'School Run',
    notes: 'Demo multi-drop route for testing office route library and cover work.',
    stops: [
      { label: 'Esk Valley Coaches, Whitby', shortLabel: 'Esk Valley Coaches', lat: 54.47587, lng: -0.62705 },
      { label: 'Sleights Village', shortLabel: 'Sleights', lat: 54.45662, lng: -0.66472 },
      { label: 'Fylingthorpe / Robin Hood’s Bay turn', shortLabel: 'Fylingthorpe', lat: 54.43292, lng: -0.53571 },
      { label: 'Scarborough Railway Station', shortLabel: 'Scarborough Station', lat: 54.27988, lng: -0.40562 },
    ],
  },
  {
    id: 'whitby-scarborough-coach-cover',
    name: 'Whitby → Scarborough Cover',
    operator: 'Esk Valley / Cover',
    type: 'Coach Cover',
    notes: 'Useful test route for A171 road-test behaviour.',
    stops: [
      { label: 'Esk Valley Coaches, Whitby', shortLabel: 'Esk Valley', lat: 54.47587, lng: -0.62705 },
      { label: 'Whitby Bus Station', shortLabel: 'Whitby Bus Station', lat: 54.4863, lng: -0.6133 },
      { label: 'Cloughton', shortLabel: 'Cloughton', lat: 54.3363, lng: -0.4492 },
      { label: 'Scarborough Railway Station', shortLabel: 'Scarborough Station', lat: 54.27988, lng: -0.40562 },
    ],
  },
  {
    id: 'manchester-airport-t2-test',
    name: 'Manchester Airport T2 Test',
    operator: 'Long Distance Test',
    type: 'Airport',
    notes: 'Long-distance route for future motorway / National Highways testing.',
    stops: [
      { label: 'Esk Valley Coaches, Whitby', shortLabel: 'Esk Valley', lat: 54.47587, lng: -0.62705 },
      { label: 'Birch Services westbound', shortLabel: 'Birch Services', lat: 53.5568, lng: -2.2694 },
      { label: 'Manchester Airport Terminal 2', shortLabel: 'Manchester Airport T2', lat: 53.3655, lng: -2.2727 },
    ],
  },
]
