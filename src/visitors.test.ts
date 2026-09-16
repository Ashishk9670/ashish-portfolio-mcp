import { describe, it, expect } from "vitest";
import { extractLocation, recordVisit, getVisits } from "./visitors";
import { createFakeKv } from "./testKv";

describe("extractLocation", () => {
  it("rounds coordinates to 1 decimal (~11km), never exact", () => {
    const location = extractLocation({
      latitude: "12.9715987",
      longitude: "77.5945627",
      country: "IN",
      city: "Bengaluru",
    });
    expect(location).toEqual({ lat: 13, lon: 77.6, country: "IN", city: "Bengaluru" });
  });

  it("returns null when Cloudflare's cf object is missing (e.g. local dev)", () => {
    expect(extractLocation(undefined)).toBeNull();
  });

  it("returns null when latitude/longitude aren't present", () => {
    expect(extractLocation({ country: "IN", city: "Bengaluru" })).toBeNull();
  });

  it("falls back to 'Unknown' rather than throwing when country/city are missing", () => {
    const location = extractLocation({ latitude: "1", longitude: "2" });
    expect(location).toEqual({ lat: 1, lon: 2, country: "Unknown", city: "Unknown" });
  });
});

describe("recordVisit / getVisits", () => {
  it("starts a new location at count 1", async () => {
    const kv = createFakeKv();
    await recordVisit(kv as never, { lat: 13, lon: 77.6, country: "IN", city: "Bengaluru" });
    expect(await getVisits(kv as never)).toEqual([
      { lat: 13, lon: 77.6, country: "IN", city: "Bengaluru", count: 1 },
    ]);
  });

  it("increments an existing location's count instead of duplicating it", async () => {
    const kv = createFakeKv();
    const location = { lat: 13, lon: 77.6, country: "IN", city: "Bengaluru" };
    await recordVisit(kv as never, location);
    await recordVisit(kv as never, location);
    await recordVisit(kv as never, location);
    const visits = await getVisits(kv as never);
    expect(visits).toHaveLength(1);
    expect(visits[0].count).toBe(3);
  });

  it("keeps distinct locations separate", async () => {
    const kv = createFakeKv();
    await recordVisit(kv as never, { lat: 13, lon: 77.6, country: "IN", city: "Bengaluru" });
    await recordVisit(kv as never, { lat: 51.5, lon: -0.1, country: "GB", city: "London" });
    expect(await getVisits(kv as never)).toHaveLength(2);
  });

  it("returns an empty array when nothing has been recorded yet", async () => {
    const kv = createFakeKv();
    expect(await getVisits(kv as never)).toEqual([]);
  });
});
