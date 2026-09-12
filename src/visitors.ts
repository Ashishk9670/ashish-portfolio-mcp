import { VisitLocation, VisitsResponseSchema } from "./schemas";

const STORE_KEY = "aggregate";

// Cloudflare's per-request `cf` object already carries an edge-derived
// location — no third-party geo-IP lookup, and the raw IP is never read or
// stored. Coordinates are rounded to 1 decimal (~11km) so the stored location
// is city-level, never exact.
type IncomingRequestCf = {
  latitude?: string;
  longitude?: string;
  country?: string;
  city?: string;
};

export function extractLocation(cf: IncomingRequestCf | undefined): Omit<VisitLocation, "count"> | null {
  if (!cf?.latitude || !cf?.longitude) return null;
  const lat = Math.round(parseFloat(cf.latitude) * 10) / 10;
  const lon = Math.round(parseFloat(cf.longitude) * 10) / 10;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon, country: cf.country ?? "Unknown", city: cf.city ?? "Unknown" };
}

// Single JSON document rather than one KV key per location: at portfolio-site
// traffic volumes this stays small, and it avoids KV's paginated list() plus
// an N+1 get() per location just to render one map. The read-modify-write
// below isn't atomic — two visits landing in the same instant could race and
// one increment could be lost — an acceptable trade for a visit counter at
// this scale, not something worth a Durable Object for.
export async function recordVisit(kv: KVNamespace, location: Omit<VisitLocation, "count">): Promise<void> {
  const raw = await kv.get(STORE_KEY);
  const locations: VisitLocation[] = raw ? JSON.parse(raw) : [];

  const existing = locations.find((l) => l.lat === location.lat && l.lon === location.lon);
  if (existing) {
    existing.count += 1;
  } else {
    locations.push({ ...location, count: 1 });
  }

  await kv.put(STORE_KEY, JSON.stringify(locations));
}

export async function getVisits(kv: KVNamespace): Promise<VisitLocation[]> {
  const raw = await kv.get(STORE_KEY);
  if (!raw) return [];
  return VisitsResponseSchema.parse(JSON.parse(raw));
}
