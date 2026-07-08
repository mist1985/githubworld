// A spread of real cities (lat, lng) weighted loosely toward developer hubs.
// GitHub's Events API does not expose location, so we deterministically hash
// each event's actor/repo onto one of these points — same author always lands
// in the same place, which reads as coherent "activity across the world".
export const CITIES = [
  { name: 'San Francisco', lat: 37.77, lng: -122.42, w: 9, cc: 'US' },
  { name: 'Seattle', lat: 47.61, lng: -122.33, w: 5, cc: 'US' },
  { name: 'New York', lat: 40.71, lng: -74.0, w: 8, cc: 'US' },
  { name: 'Austin', lat: 30.27, lng: -97.74, w: 4, cc: 'US' },
  { name: 'Toronto', lat: 43.65, lng: -79.38, w: 4, cc: 'CA' },
  { name: 'São Paulo', lat: -23.55, lng: -46.63, w: 5, cc: 'BR' },
  { name: 'London', lat: 51.51, lng: -0.13, w: 8, cc: 'GB' },
  { name: 'Berlin', lat: 52.52, lng: 13.4, w: 6, cc: 'DE' },
  { name: 'Paris', lat: 48.86, lng: 2.35, w: 5, cc: 'FR' },
  { name: 'Amsterdam', lat: 52.37, lng: 4.9, w: 4, cc: 'NL' },
  { name: 'Stockholm', lat: 59.33, lng: 18.07, w: 3, cc: 'SE' },
  { name: 'Madrid', lat: 40.42, lng: -3.7, w: 3, cc: 'ES' },
  { name: 'Lagos', lat: 6.52, lng: 3.38, w: 3, cc: 'NG' },
  { name: 'Nairobi', lat: -1.29, lng: 36.82, w: 2, cc: 'KE' },
  { name: 'Cairo', lat: 30.04, lng: 31.24, w: 2, cc: 'EG' },
  { name: 'Tel Aviv', lat: 32.08, lng: 34.78, w: 3, cc: 'IL' },
  { name: 'Bengaluru', lat: 12.97, lng: 77.59, w: 9, cc: 'IN' },
  { name: 'Mumbai', lat: 19.08, lng: 72.88, w: 5, cc: 'IN' },
  { name: 'Delhi', lat: 28.61, lng: 77.21, w: 5, cc: 'IN' },
  { name: 'Singapore', lat: 1.35, lng: 103.82, w: 5, cc: 'SG' },
  { name: 'Jakarta', lat: -6.21, lng: 106.85, w: 3, cc: 'ID' },
  { name: 'Shanghai', lat: 31.23, lng: 121.47, w: 7, cc: 'CN' },
  { name: 'Beijing', lat: 39.9, lng: 116.4, w: 6, cc: 'CN' },
  { name: 'Shenzhen', lat: 22.54, lng: 114.06, w: 5, cc: 'CN' },
  { name: 'Tokyo', lat: 35.68, lng: 139.69, w: 7, cc: 'JP' },
  { name: 'Seoul', lat: 37.57, lng: 126.98, w: 5, cc: 'KR' },
  { name: 'Sydney', lat: -33.87, lng: 151.21, w: 4, cc: 'AU' },
  { name: 'Melbourne', lat: -37.81, lng: 144.96, w: 3, cc: 'AU' },
  { name: 'Moscow', lat: 55.76, lng: 37.62, w: 4, cc: 'RU' },
  { name: 'Warsaw', lat: 52.23, lng: 21.01, w: 3, cc: 'PL' },
  { name: 'Kyiv', lat: 50.45, lng: 30.52, w: 3, cc: 'UA' },
  { name: 'Bogotá', lat: 4.71, lng: -74.07, w: 2, cc: 'CO' },
  { name: 'Mexico City', lat: 19.43, lng: -99.13, w: 4, cc: 'MX' },
  { name: 'Buenos Aires', lat: -34.6, lng: -58.38, w: 3, cc: 'AR' }
]

// ISO code → display name for the countries above.
export const COUNTRY_NAMES = {
  US: 'United States', CA: 'Canada', BR: 'Brazil', GB: 'United Kingdom',
  DE: 'Germany', FR: 'France', NL: 'Netherlands', SE: 'Sweden', ES: 'Spain',
  NG: 'Nigeria', KE: 'Kenya', EG: 'Egypt', IL: 'Israel', IN: 'India',
  SG: 'Singapore', ID: 'Indonesia', CN: 'China', JP: 'Japan', KR: 'South Korea',
  AU: 'Australia', RU: 'Russia', PL: 'Poland', UA: 'Ukraine', CO: 'Colombia',
  MX: 'Mexico', AR: 'Argentina'
}

// Emoji flag from a 2-letter ISO country code.
export function countryFlag(cc) {
  if (!cc || cc.length !== 2) return '🏳️'
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

// Precompute a weighted lookup table for fast, stable hashing.
const TABLE = []
CITIES.forEach((c, i) => {
  for (let k = 0; k < c.w; k++) TABLE.push(i)
})

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Pick a city for a seed (the actor is consistently placed in one city), but
// scatter each individual event randomly within a small radius of it. That way
// many events from the same hub form a visible CLUSTER of dots — e.g. 10 events
// from Tokyo show as 10 glowing dots, so a busy city reads as a hotspot —
// instead of stacking on one pixel. The spread stays small enough to keep dots
// on/around the actual city rather than out at sea.
export function locateBySeed(seed) {
  const h = hashString(seed || 'anon')
  const city = CITIES[TABLE[h % TABLE.length]]
  // Small jitter (±0.8°) so repeated events at a hub don't stack on one pixel,
  // while staying on the actual city.
  return {
    name: city.name,
    cc: city.cc,
    lat: city.lat + (Math.random() - 0.5) * 1.6,
    lng: city.lng + (Math.random() - 0.5) * 1.6
  }
}
