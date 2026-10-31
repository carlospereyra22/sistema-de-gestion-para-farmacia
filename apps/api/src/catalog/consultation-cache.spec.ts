import { ConsultationCache } from "./consultation-cache";

describe("short-lived consultation cache", () => {
  afterEach(() => jest.restoreAllMocks());
  it("shares simultaneous requests and reuses successful results", async () => {
    const cache = new ConsultationCache<number>();
    const fetchValue = jest.fn().mockResolvedValue(42);
    const first = cache.get("a", fetchValue);
    const second = cache.get("a", fetchValue);
    expect(second).toBe(first);
    expect(await first).toBe(42);
    expect(await cache.get("a", fetchValue)).toBe(42);
    expect(fetchValue).toHaveBeenCalledTimes(1);
  });
  it("refreshes after TTL without returning stale data", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1000);
    const cache = new ConsultationCache<number>(60_000);
    const fetchValue = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    expect(await cache.get("a", fetchValue)).toBe(1);
    clock.mockReturnValue(61_000);
    expect(await cache.get("a", fetchValue)).toBe(2);
    expect(fetchValue).toHaveBeenCalledTimes(2);
  });
  it("does not retain failures", async () => {
    const cache = new ConsultationCache<number>();
    const fetchValue = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(7);
    await expect(cache.get("a", fetchValue)).rejects.toThrow("offline");
    expect(await cache.get("a", fetchValue)).toBe(7);
  });
  it("bounds retained entries and keeps independent keys separate", async () => {
    const cache = new ConsultationCache<number>(60_000, 2);
    const fetchValue = jest.fn().mockResolvedValue(1);
    await cache.get("a", fetchValue);
    await cache.get("b", fetchValue);
    await cache.get("c", fetchValue);
    await cache.get("b", fetchValue);
    expect(fetchValue).toHaveBeenCalledTimes(3);
    await cache.get("a", fetchValue);
    expect(fetchValue).toHaveBeenCalledTimes(4);
  });
});
