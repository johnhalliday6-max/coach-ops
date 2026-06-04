export const SAVED_PLACES = [
  { terms: ['esk valley', 'esk valley coaches', 'fairfield way', 'whitby depot', 'esk valley whitby'], lat: 54.47587, lng: -0.62705, label: 'Esk Valley Coaches, 4 Fairfield Way, Whitby YO22 4PU', shortLabel: 'Esk Valley Coaches', type: 'Depot' },
  { terms: ['scarborough train station', 'scarborough railway station', 'scarborough station', 'westborough station', 'scarborough rail'], lat: 54.27976, lng: -0.4057, label: 'Scarborough Railway Station, Westborough, Scarborough YO11 1TN', shortLabel: 'Scarborough Railway Station', type: 'Rail Station' },
  { terms: ['scarborough spa', 'scarborough spa theatre'], lat: 54.27595, lng: -0.39424, label: 'Scarborough Spa, South Bay, Scarborough', shortLabel: 'Scarborough Spa', type: 'Venue' },
  { terms: ['manchester airport t2', 'manchester terminal 2', 'terminal 2 manchester', 'manchester airport terminal 2'], lat: 53.36513, lng: -2.27261, label: 'Manchester Airport Terminal 2', shortLabel: 'Manchester Airport T2', type: 'Airport' },
  { terms: ['manchester airport t1', 'manchester terminal 1', 'terminal 1 manchester'], lat: 53.36583, lng: -2.27290, label: 'Manchester Airport Terminal 1', shortLabel: 'Manchester Airport T1', type: 'Airport' },
  { terms: ['manchester airport t3', 'manchester terminal 3', 'terminal 3 manchester'], lat: 53.36290, lng: -2.27432, label: 'Manchester Airport Terminal 3', shortLabel: 'Manchester Airport T3', type: 'Airport' },
  { terms: ['big ben', 'westminster clock tower', 'elizabeth tower'], lat: 51.50073, lng: -0.12463, label: 'Big Ben, Westminster, London', shortLabel: 'Big Ben', type: 'Landmark' },
  { terms: ['london victoria coach station', 'victoria coach station', 'london victoria'], lat: 51.49321, lng: -0.14918, label: 'Victoria Coach Station, London', shortLabel: 'Victoria Coach Station', type: 'Coach Station' },
  { terms: ['birch services', 'birch motorway services'], lat: 53.55534, lng: -2.22173, label: 'Birch Services M62', shortLabel: 'Birch Services', type: 'Services' },
  { terms: ['wetherby services'], lat: 53.9287, lng: -1.3866, label: 'Wetherby Services A1(M)', shortLabel: 'Wetherby Services', type: 'Services' },
  { terms: ['scotch corner', 'scotch corner services'], lat: 54.4431, lng: -1.6696, label: 'Scotch Corner Services', shortLabel: 'Scotch Corner', type: 'Services' },
  { terms: ['washington services'], lat: 54.8997, lng: -1.5449, label: 'Washington Services A1(M)', shortLabel: 'Washington Services', type: 'Services' },
  { terms: ['ferrybridge services'], lat: 53.7100, lng: -1.2790, label: 'Ferrybridge Services M62/A1(M)', shortLabel: 'Ferrybridge Services', type: 'Services' },
  { terms: ['leeming bar services'], lat: 54.3054, lng: -1.5588, label: 'Leeming Bar Services A1(M)', shortLabel: 'Leeming Bar Services', type: 'Services' },
  { terms: ['york racecourse'], lat: 53.93872, lng: -1.09682, label: 'York Racecourse', shortLabel: 'York Racecourse', type: 'Pickup' },
  { terms: ['york station', 'york railway station'], lat: 53.95797, lng: -1.09318, label: 'York Railway Station', shortLabel: 'York Station', type: 'Rail Station' },
  { terms: ['leeds coach station'], lat: 53.79759, lng: -1.53685, label: 'Leeds Coach Station', shortLabel: 'Leeds Coach Station', type: 'Coach Station' },
]

export function savedMatches(query, limit = 8) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  return SAVED_PLACES.filter((place) => place.terms.some((term) => term.includes(q) || q.includes(term)))
    .slice(0, limit)
    .map(({ terms, ...place }) => ({ ...place, source: 'saved' }))
}

export function findSavedPlace(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return null
  const found = SAVED_PLACES.find((place) => place.terms.some((term) => term === q || term.includes(q) || q.includes(term)))
  if (!found) return null
  const { terms, ...place } = found
  return { ...place, source: 'saved' }
}
