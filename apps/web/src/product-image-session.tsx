import { useState, type ReactNode } from "react";
import { ImageCacheContext } from "./lib/image-cache-context";
import { createProductImageCache } from "./lib/product-image-cache";

export function ProductImageSession({ children }: { children: ReactNode }) {
  const [cache] = useState(() => createProductImageCache());
  return (
    <ImageCacheContext.Provider value={cache}>
      {children}
    </ImageCacheContext.Provider>
  );
}
