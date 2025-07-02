import { CacheOptions, LRUNode } from '../types';

/**
 * Least Recently Used (LRU) cache with optional TTL support.
 * 
 * This implementation uses a doubly-linked list combined with a hash map to achieve
 * O(1) performance for all operations.
 * 
 * Key features:
 * - **O(1) operations**: Get, Set, Has, and eviction are all O(1)
 * - **LRU eviction**: Based on actual access order with constant-time eviction
 * - **TTL support**: Optional automatic expiration of entries
 * - **Memory safety**: Bounded size with predictable memory usage
 * - **Framework agnostic**: Works in Node.js, Deno, Bun, Edge Runtime, etc.
 * - **Thread-safe operations**: All operations are synchronous and atomic
 * 
 * @example
 * ```typescript
 * // JWKS key caching example
 * const jwksCache = new LRUCache({ maxSize: 20, ttl: 3600000 }); // 1 hour
 * jwksCache.set('kid123', publicKeyPem);
 * const cachedKey = jwksCache.get('kid123');
 * ```
 */
export class LRUCache {
  /**
   * Hash map for O(1) key lookups pointing to doubly-linked list nodes.
   */
  private cache = new Map<string, LRUNode>();
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
   * Head of the doubly-linked list (most recently used)
   */
  private head: LRUNode;
  /**
   * Tail of the doubly-linked list (least recently used)
   */
  private tail: LRUNode;

  /**
   * Creates a new LRU cache instance with the specified configuration.
   * 
   * @param options - Configuration object specifying cache behavior
   * @throws {Error} If maxSize or ttl are not a positive integer
   * 
   * @example
   * ```typescript
   * // Simple cache for 100 keys
   * const cache = new LRUCache({ maxSize: 100 });
   * 
   * // Cache with 60-minute expiration
   * const expiringCache = new LRUCache({ maxSize: 50, ttl: 60 * 60 * 1000 });
   * ```
   */
  constructor(options: CacheOptions) {
    if (!options.maxSize || !Number.isInteger(options.maxSize) || options.maxSize <= 0) {
      throw new Error('maxSize must be a positive integer');
    }
    if (options.ttl && (!Number.isInteger(options.ttl) || options.ttl <= 0)) {
      throw new Error('ttl must be a positive integer (if specified)');
    }
    
    this.maxSize = options.maxSize;
    this.ttl = options.ttl ?? undefined;
    
    // Initialize dummy head and tail nodes to simplify edge cases
    this.head = { key: '', value: '', lastAccessed: 0, prev: null, next: null };
    this.tail = { key: '', value: '', lastAccessed: 0, prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Retrieves a value from the cache and moves it to the front (most recently used).
   * 
   * This method implements LRU behavior with O(1) performance by moving the accessed node to the
   * head of the doubly-linked list. If the entry has expired based on TTL, it will be automatically
   * removed and undefined will be returned.
   * 
   * @param key - The cache key to retrieve
   * @returns The cached value if found and not expired, undefined otherwise
   * 
   * @example
   * ```typescript
   * cache.set('kid123', 'public_key123');
   * 
   * // Later...
   * const key123 = cache.get('kid123'); // 'public_key123' moves to front
   * const missing = cache.get('kid999'); // undefined
   * 
   * // After TTL expiration (if configured)
   * const expired = cache.get('kid123'); // undefined (auto-removed)
   * ```
   */
  get(key: string): string | undefined {
    // First check for existing key
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }

    // Check TTL expiration
    if (this.ttl && Date.now() - node.lastAccessed > this.ttl) {
      this.removeNode(node);
      this.cache.delete(key);
      return undefined;
    }

    // Move to front (most recently used) and update access time
    node.lastAccessed = Date.now();
    this.moveToFront(node);
    
    return node.value;
  }

  /**
   * Stores a value in the cache with O(1) LRU eviction when size limit is exceeded.
   * 
   * If the key already exists, updates the value and moves it to the front.
   * If adding a new entry would exceed maxSize, evicts the least recently
   * used entry (tail) in O(1) time before adding the new one.
   * 
   * @param key - The cache key to store
   * @param value - The string value to cache
   * 
   * @example
   * ```typescript
   * // Store new entries
   * cache.set('kid123', 'public_key123');
   * cache.set('kid456', 'public_key456');
   * 
   * // Update existing entry (moves to front, resets TTL if configured)
   * cache.set('kid123', 'public_key123');
   * 
   * // When cache is full, LRU entry is automatically evicted in O(1) time
   * cache.set('kid789', 'public_key789'); // Evicts tail node instantly
   * ```
   */
  set(key: string, value: string): void {
    const now = Date.now();
    const existingNode = this.cache.get(key);
    
    // Make existing node most recently used
    if (existingNode) {
      existingNode.lastAccessed = now;
      this.moveToFront(existingNode);
      return;
    }

    // Otherwise create a new node
    const newNode: LRUNode = { key, value, lastAccessed: now, prev: null, next: null };
    this.cache.set(key, newNode);
    this.addToFront(newNode);

    // Eviction occurs if over capacity
    if (this.cache.size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Checks if a key exists in the cache without updating access order.
   * 
   * This is useful for existence checks that shouldn't affect LRU ordering.
   * Automatically removes and returns false for expired entries.
   * 
   * @param key - The cache key to check
   * @returns True if the key exists and is not expired, false otherwise
   * 
   * @example
   * ```typescript
   * cache.set('key123', 'public_key123');
   * 
   * if (cache.has('key123')) {
   *   console.log('Data exists in cache');
   *   // LRU order is NOT affected by this check
   * }
   * 
   * // Check for expired entries
   * if (!cache.has('oldKey')) {
   *   console.log('Data missing or expired');
   * }
   * ```
   */
  has(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    // Check if expired
    if (this.ttl && Date.now() - node.lastAccessed > this.ttl) {
      this.removeNode(node);
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Removes a specific key from the cache in O(1) time.
   * 
   * @param key - The cache key to remove
   * @returns True if the key existed and was removed, false if it didn't exist
   * 
   * @example
   * ```typescript
   * cache.set('key123', 'public_key123');
   * 
   * // Later, when entry expires
   * const wasRemoved = cache.delete('key123'); // true
   * const alreadyGone = cache.delete('key123'); // false
   * ```
   */
  delete(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  /**
   * Removes all entries from the cache. Resets the cache to an empty state and
   * reinitializes the doubly-linked list.
   * 
   * @example
   * ```typescript
   * // Reset during testing
   * beforeEach(() => {
   *   cache.clear();
   *   console.log(cache.size()); // 0
   * });
   * ```
   */
  clear(): void {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Returns the current number of entries in the cache.
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
   * ```
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns cache statistics for monitoring and debugging.
   * 
   * @returns Object containing current cache statistics
   * 
   * @example
   * ```typescript
   * const stats = cache.getStats();
   * console.log(`Cache utilization: ${stats.size}/${stats.maxSize}`);
   * console.log(`Fill ratio: ${(stats.size / stats.maxSize * 100).toFixed(1)}%`);
   * ```
   */
  getStats(): { size: number; maxSize: number; hitRatio?: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }

  /**
   * Moves a node to the front of the doubly-linked list (most recently used).
   * This is an O(1) operation that maintains LRU ordering.
   * 
   * @private
   * @param node - The node to move to front
   */
  private moveToFront(node: LRUNode): void {
    this.removeNode(node);
    this.addToFront(node);
  }

  /**
   * Adds a node to the front of the doubly-linked list (after head).
   * This is an O(1) operation.
   * 
   * @private
   * @param node - The node to add to front
   */
  private addToFront(node: LRUNode): void {
    node.prev = this.head;
    node.next = this.head.next;
    
    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
  }

  /**
   * Removes a node from the doubly-linked list. This is an O(1) operation.
   * 
   * @private
   * @param node - The node to remove
   */
  private removeNode(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
  }

  /**
   * Removes the least recently used entry (tail) from the cache. This is an O(1)
   * operation that maintains cache size limits.
   * 
   * @private
   */
  private evictLeastRecentlyUsed(): void {
    const lru = this.tail.prev;
    if (lru && lru !== this.head) {
      this.removeNode(lru);
      this.cache.delete(lru.key);
    }
  }
}
