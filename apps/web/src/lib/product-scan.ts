export function isProductScan(
  digits: string,
  started: number,
  last: number,
  now: number,
) {
  return (
    /^(?:[0-9]{8}|[0-9]{12,14})$/.test(digits) &&
    now - last < 100 &&
    now - started < 650
  );
}
