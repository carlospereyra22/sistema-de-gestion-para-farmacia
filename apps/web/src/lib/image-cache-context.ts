import { createContext } from "react";
import { createProductImageCache } from "./product-image-cache";

export const ImageCacheContext = createContext<ReturnType<
  typeof createProductImageCache
> | null>(null);
