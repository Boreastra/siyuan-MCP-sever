/**
 * Knowledge Cache — TTL-based in-memory cache for workflow results.
 *
 * Avoids repeated heavy reads (dozens of documents) for the same query.
 * Default TTL: 10s.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class WorkflowCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL: number;

  constructor(defaultTTLMs = 10_000) {
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Get a cached value. Returns undefined if missing or expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a cached value with optional TTL override.
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  /**
   * Build a cache key from workflow name + stringified params.
   */
  static key(workflow: string, params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = params[k];
        return acc;
      }, {});
    return `${workflow}:${JSON.stringify(sorted)}`;
  }

  /** Clear all entries */
  clear(): void {
    this.store.clear();
  }

  /** Expire all entries immediately */
  expireAll(): void {
    for (const [key, entry] of this.store.entries()) {
      entry.expiresAt = Date.now() - 1;
    }
  }

  /** Number of active (non-expired) entries */
  get size(): number {
    let count = 0;
    const now = Date.now();
    for (const entry of this.store.values()) {
      if (entry.expiresAt > now) count++;
    }
    return count;
  }
}

/** Singleton cache instance shared across all workflows */
export const workflowCache = new WorkflowCache();
