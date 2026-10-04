export type LatLng = { latitude: number; longitude: number };

const R_EARTH_KM = 6371.0088;
/** Sphere radius used by the MODIS sinusoidal grid (metres). */
export const MODIS_R = 6371007.181;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(s));
}

/** MODIS sinusoidal projection (x, y in metres) -> geographic coordinates. */
export function sinusoidalToLatLng(x: number, y: number): LatLng {
  const lat = y / MODIS_R;
  const lon = x / (MODIS_R * Math.cos(lat));
  return { latitude: (lat * 180) / Math.PI, longitude: (lon * 180) / Math.PI };
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function regionFor(center: LatLng, radiusKm: number) {
  const latDelta = (radiusKm * 2.6) / 111;
  const lonDelta = latDelta / Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  return { ...center, latitudeDelta: latDelta, longitudeDelta: lonDelta };
}

export const DHAKA: LatLng = { latitude: 23.7808, longitude: 90.4093 };
