import { fractionalPrice } from "./fractional-price";
it("divides and applies markup before rounding once to cents", () => {
  expect(fractionalPrice(1285957n, 2, 0)).toBe(642979n);
  expect(fractionalPrice(1285957n, 2, 1000)).toBe(707276n);
  expect(fractionalPrice(10000n, 20, 2500)).toBe(625n);
  expect(fractionalPrice(1n, 2, 1000)).toBe(1n);
  expect(fractionalPrice(0n, 2, 0)).toBe(0n);
});
it("rejects absent bases, invalid divisors, negative markup and overflow", () => {
  for (const divisor of [0, -1, 1.5, 1000001, NaN])
    expect(() => fractionalPrice(100n, divisor, 0)).toThrow();
  for (const markup of [-1, 0.5, 1000001])
    expect(() => fractionalPrice(100n, 2, markup)).toThrow();
  expect(() => fractionalPrice(null, 2, 0)).toThrow();
  expect(() => fractionalPrice(-1n, 2, 0)).toThrow();
  expect(() => fractionalPrice(999999999999n, 1, 1000)).toThrow();
});
