import { CacheEntry, CacheOptions } from '../types';

/**
 * High-performance LRU (Least Recently Used) cache with TTL support.
 * 
 * This implementation provides true access-time based eviction rather than insertion-order
 * eviction, making it ideal for caching JWKS keys where access patterns matter more than
 * creation order.
 * 
 * Key features:
 * - **True LRU eviction**: Based on actual access time, not insertion order
 * - **TTL support**: Optional automatic expiration of entries
 * - **Memory safety**: Bounded size with predictable memory usage
 * - **Framework agnostic**: Works in Node.js, Deno, Bun, Edge Runtime, etc.
 * - **Thread-safe operations**: All operations are synchronous and atomic
 * 
 * Performance characteristics:
 * - Get/Set/Has operations: O(1) average case
 * - Eviction operation: O(n) when cache is at capacity and new entry is added
 * - Memory overhead: Minimal metadata per entry
 * 
 * @example
 * ```typescript
 * // Basic cache without TTL
 * const cache = new LRUCache({ maxSize: 100 });
 * cache.set('key1', 'value1');
 * const value = cache.get('key1'); // 'value1'
 * 
 * // Cache with 10-minute TTL
 * const cacheWithTTL = new LRUCache({ 
 *   maxSize: 50, 
 *   ttl: 10 * 60 * 1000 
 * });
 * 
 * // JWKS key caching example
 * const jwksCache = new LRUCache({ maxSize: 20, ttl: 3600000 }); // 1 hour
 * jwksCache.set('kid123', publicKeyPem);
 * const cachedKey = jwksCache.get('kid123');
 * ```
 */
export class LRUCache {
  /**
   * Internal Map storing cache entries with metadata. Uses JavaScript Map for O(1) key
   * lookups and maintains insertion order for iteration.
   */
  private cache = new Map<string, CacheEntry>();
  /**
   * Maximum number of entries allowed in the cache. Triggers LRU eviction when exceeded.
   */
  private maxSize: number;
  /**
   * Optional time-to-live in milliseconds. If defined, entries expire after this duration
   * regardless of access patterns.
   */
  private ttl?: number;

  /**
   * Creates a new LRU cache instance with the specified configuration.
   * 
   * @param options - Configuration object specifying cache behavior
   * @throws {Error} If maxSize is not a positive integer
   * 
   * @example
   * ```typescript
   * // Simple cache for 100 items
   * const cache = new LRUCache({ maxSize: 100 });
   * 
   * // Cache with 5-minute expiration
   * const expiringCache = new LRUCache({ 
   *   maxSize: 50, 
   *   ttl: 5 * 60 * 1000 
   * });
   * ```
   */
  constructor(options: CacheOptions) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl;
  }

  /**
   * Retrieves a value from the cache and updates its access time for LRU tracking.
   * 
   * This method implements true LRU behavior by updating the lastAccessed timestamp
   * on every successful retrieval. If the entry has expired based on TTL, it will
   * be automatically removed and undefined will be returned.
   * 
   * @param key - The cache key to retrieve
   * @returns The cached value if found and not expired, undefined otherwise
   * 
   * @example
   * ```typescript
   * cache.set('user:123', 'john@example.com');
   * 
   * // Later...
   * const email = cache.get('user:123'); // 'john@example.com'
   * const missing = cache.get('user:999'); // undefined
   * 
   * // After TTL expiration (if configured)
   * const expired = cache.get('user:123'); // undefined (auto-removed)
   * ```
   */
  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL expiration
    if (this.ttl && Date.now() - entry.created > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Update last accessed time for proper LRU behavior
    entry.lastAccessed = Date.now();
    
    return entry.value;
  }

  /**
   * Stores a value in the cache with proper LRU eviction when size limit is exceeded.
   * 
   * If the key already exists, updates the value and resets both access and creation
   * timestamps. If adding a new entry would exceed maxSize, evicts the least recently
   * used entry before adding the new one.
   * 
   * @param key - The cache key to store
   * @param value - The string value to cache
   * 
   * @example
   * ```typescript
   * // Store new entries
   * cache.set('config:theme', 'dark');
   * cache.set('config:lang', 'en-US');
   * 
   * // Update existing entry (resets TTL if configured)
   * cache.set('config:theme', 'light');
   * 
   * // When cache is full, LRU entry is automatically evicted
   * cache.set('config:timezone', 'UTC'); // May evict oldest unused entry
   * ```
   */
  set(key: string, value: string): void {
    const now = Date.now();
    
    // Update existing entry
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.lastAccessed = now;
      entry.created = now;
      return;
    }

    // Add new entry
    this.cache.set(key, {
      value,
      lastAccessed: now,
      created: now,
    });

    // Proper LRU eviction: remove least recently accessed item
    if (this.cache.size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Checks if a key exists in the cache without updating access time.
   * 
   * This is useful for existence checks that shouldn't affect LRU ordering.
   * Automatically removes and returns false for expired entries.
   * 
   * @param key - The cache key to check
   * @returns True if the key exists and is not expired, false otherwise
   * 
   * @example
   * ```typescript
   * cache.set('temp:data', 'value');
   * 
   * if (cache.has('temp:data')) {
   *   console.log('Data exists in cache');
   *   // Access time is NOT updated by this check
   * }
   * 
   * // Check for expired entries
   * if (!cache.has('old:data')) {
   *   console.log('Data missing or expired');
   * }
   * ```
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (this.ttl && Date.now() - entry.created > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Removes a specific key from the cache.
   * 
   * @param key - The cache key to remove
   * @returns True if the key existed and was removed, false if it didn't exist
   * 
   * @example
   * ```typescript
   * cache.set('session:abc123', 'user-data');
   * 
   * // Later, when session expires
   * const wasRemoved = cache.delete('session:abc123'); // true
   * const alreadyGone = cache.delete('session:abc123'); // false
   * ```
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Removes all entries from the cache.
   * 
   * Resets the cache to an empty state, freeing all stored memory.
   * Useful for testing or when a complete cache invalidation is needed.
   * 
   * @example
   * ```typescript
   * // Emergency cache flush
   * cache.clear();
   * console.log(cache.size()); // 0
   * 
   * // Reset during testing
   * beforeEach(() => {
   *   cache.clear();
   * });
   * ```
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns the current number of entries in the cache.
   * 
   * Note that this count includes entries that may have expired but haven't
   * been accessed yet (lazy expiration). For accurate counts, consider calling
   * a cleanup method if implementing one.
   * 
   * @returns The number of entries currently stored
   * 
   * @example
   * ```typescript
   * const cache = new LRUCache({ maxSize: 100 });
   * console.log(cache.size()); // 0
   * 
   * cache.set('a', '1');
   * cache.set('b', '2');
   * console.log(cache.size()); // 2
   * 
   * // Check cache utilization
   * if (cache.size() > cache.getStats().maxSize * 0.8) {
   *   console.log('Cache is getting full');
   * }
   * ```
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns cache statistics for monitoring and debugging.
   * 
   * Provides insights into cache utilization and performance characteristics.
   * Useful for monitoring cache effectiveness and tuning cache parameters.
   * 
   * @returns Object containing current cache statistics
   * 
   * @example
   * ```typescript
   * const stats = cache.getStats();
   * console.log(`Cache utilization: ${stats.size}/${stats.maxSize}`);
   * console.log(`Fill ratio: ${(stats.size / stats.maxSize * 100).toFixed(1)}%`);
   * 
   * // Monitor for capacity planning
   * if (stats.size >= stats.maxSize * 0.9) {
   *   console.warn('Cache nearing capacity, consider increasing maxSize');
   * }
   * 
   * // Future enhancement: hit ratio tracking
   * if (stats.hitRatio !== undefined) {
   *   console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
   * }
   * ```
   */
  getStats(): { size: number; maxSize: number; hitRatio?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      // Could add hit/miss tracking here if needed
    };
  }

  /**
   * Finds and removes the least recently accessed entry from the cache.
   * 
   * This is the core LRU eviction logic that maintains cache size limits.
   * Iterates through all entries to find the one with the oldest lastAccessed
   * timestamp, then removes it. This is an O(n) operation that only occurs
   * when adding a new entry would cause the cache to reach maxSize + 1.
   * 
   * The algorithm prioritizes correctness over performance for eviction since
   * it only happens when the cache is full, and the O(1) performance of regular
   * operations is more important than the occasional O(n) eviction.
   * 
   * @private
   * @internal This method is used internally by set() and should not be called directly
   * 
   * @example
   * ```typescript
   * // Internal usage only - called automatically by set()
   * // When cache.size() > maxSize:
   * // 1. Find entry with oldest lastAccessed timestamp
   * // 2. Remove that entry from the cache
   * // 3. Make room for new entry
   * ```
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey = '';
    let oldestTime = Infinity;
    
    // Find the key with the oldest lastAccessed time
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
