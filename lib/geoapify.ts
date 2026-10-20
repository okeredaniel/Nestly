// Real (non-interactive) map for the estate, using Geoapify's free plan (no credit card needed).
// Put your key in .env at the project root:  EXPO_PUBLIC_GEOAPIFY_KEY=your_key_here
// then restart Expo with:  npx expo start -c
const KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY ?? '';

export const hasMapKey = KEY.length > 0;

if (__DEV__ && !hasMapKey) {
  console.warn('[map] EXPO_PUBLIC_GEOAPIFY_KEY is empty. Add it to .env in the project root, then run: npx expo start -c');
}

/** Address text to coordinates. Returns null when nothing matches. */
export async function geocodeAddress(text: string): Promise<{ lat: number; lng: number } | null> {
  if (!hasMapKey || !text.trim()) return null;
  const res = await fetch(
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&limit=1&format=json&apiKey=${KEY}`
  );
  if (!res.ok) {
    console.warn('[map] Geocoding request failed with status', res.status, '(401 or 403 usually means a wrong key)');
    return null;
  }
  const json = await res.json();
  const hit = json?.results?.[0];
  if (!hit || typeof hit.lat !== 'number' || typeof hit.lon !== 'number') {
    console.warn('[map] No match for the address:', text, '. Try a fuller one with city and country.');
    return null;
  }
  return { lat: hit.lat, lng: hit.lon };
}

/** Static map image centred on the point. The map's centre is exactly the estate location. */
export function staticMapUrl(lat: number, lng: number, width: number, height: number, zoom = 15) {
  return (
    `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=${Math.round(width)}&height=${Math.round(height)}` +
    `&scaleFactor=2&center=lonlat:${lng},${lat}&zoom=${zoom}&format=png&apiKey=${KEY}`
  );
}