export function productImageKey(
  token: string,
  organizationId: string,
  productId: string | undefined,
  version: string | undefined,
  sessionScoped: boolean,
) {
  return JSON.stringify([
    sessionScoped ? "session" : token,
    organizationId,
    productId,
    version,
  ]);
}

export function createProductImageCache(limit = 128) {
  const entries = new Map<
    string,
    { value?: string; pending?: Promise<string> }
  >();
  return {
    peek(key: string): string | undefined {
      return entries.get(key)?.value;
    },
    load(key: string, fetchImage: () => Promise<string>): Promise<string> {
      const current = entries.get(key);
      if (current) {
        entries.delete(key);
        entries.set(key, current);
        if (current.value !== undefined) return Promise.resolve(current.value);
        if (current.pending) return current.pending;
      }
      const entry: { value?: string; pending?: Promise<string> } = {};
      entries.set(key, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
      entry.pending = Promise.resolve()
        .then(fetchImage)
        .then(
          (url) => {
            entry.value = url;
            entry.pending = undefined;
            return url;
          },
          (error: unknown) => {
            if (entries.get(key) === entry) entries.delete(key);
            throw error;
          },
        );
      return entry.pending;
    },
  };
}

// Session/organization/product/version keys. Memory only; never persisted.
export const productImageCache = createProductImageCache();
