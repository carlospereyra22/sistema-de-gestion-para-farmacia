/** Short-lived public reference data only; never cache permissions or commercial data. */
export class ConsultationCache<T> {
  private readonly entries = new Map<
    string,
    { expires: number; value: Promise<T> }
  >();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly limit = 100,
  ) {}

  get(key: string, fetchValue: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expires > Date.now()) return existing.value;
    this.entries.delete(key);
    while (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    const entry = {
      expires: Infinity,
      value: Promise.resolve().then(fetchValue),
    };
    this.entries.set(key, entry);
    entry.value = entry.value.then(
      (value) => {
        entry.expires = Date.now() + this.ttlMs;
        return value;
      },
      (error: unknown) => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      },
    );
    return entry.value;
  }
}
