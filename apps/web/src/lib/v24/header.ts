import logo from "./logo-bitmap.json";
import name from "./store-name-bitmap.json";

// Original V24 bits, without resampling. Reference resolution: 8 dots/mm.
function bitmapUrl(bitmap: {
  width: number;
  height: number;
  widthBytes: number;
  dataBase64: string;
}) {
  const bytes = atob(bitmap.dataBase64);
  const runs: string[] = [];
  for (let y = 0; y < bitmap.height; y++) {
    let start = -1;
    for (let x = 0; x <= bitmap.width; x++) {
      const black =
        x < bitmap.width &&
        bytes.charCodeAt(y * bitmap.widthBytes + (x >> 3)) & (128 >> (x % 8));
      if (black && start < 0) start = x;
      if (!black && start >= 0) {
        runs.push(`M${start} ${y}h${x - start}v1H${start}z`);
        start = -1;
      }
    }
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${bitmap.width}" height="${bitmap.height}" viewBox="0 0 ${bitmap.width} ${bitmap.height}" shape-rendering="crispEdges"><path d="${runs.join("")}"/></svg>`)}`;
}
export const v24Logo = bitmapUrl(logo);
export const v24StoreName = bitmapUrl(name);
export function usesV24StoreName(value: string) {
  return value.trim().toUpperCase() === name.text;
}
