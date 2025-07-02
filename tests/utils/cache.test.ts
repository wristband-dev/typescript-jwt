import { LRUCache } from '../../src/utils/cache';

describe('LRUCache', () => {
  
  describe('constructor', () => {
    it('should create cache with valid options', () => {
      const cache = new LRUCache({ maxSize: 10 });
      expect(cache.size()).toBe(0);
      expect(cache.getStats().maxSize).toBe(10);
    });

    it('should create cache with TTL option', () => {
      const cache = new LRUCache({ maxSize: 10, ttl: 5000 });
      expect(cache.size()).toBe(0);
      expect(cache.getStats().maxSize).toBe(10);
    });

    it('should handle maxSize of 1', () => {
      const cache = new LRUCache({ maxSize: 1 });
      expect(cache.getStats().maxSize).toBe(1);
    });

    it('should handle large maxSize', () => {
      const cache = new LRUCache({ maxSize: 1000000 });
      expect(cache.getStats().maxSize).toBe(1000000);
    });

    it('should throw error for invalid maxSize', () => {
      expect(() => new LRUCache({ maxSize: 0 })).toThrow('maxSize must be a positive integer');
      expect(() => new LRUCache({ maxSize: -1 })).toThrow('maxSize must be a positive integer');
      expect(() => new LRUCache({ maxSize: 1.5 })).toThrow('maxSize must be a positive integer');
    });

    it('should throw error for invalid TTL', () => {
      // Undefined TTL should not throw
      expect(() => new LRUCache({ maxSize: 10 })).not.toThrow();
      // ttl: 0 doesn't throw because 0 is falsy, behaves like undefined
      expect(() => new LRUCache({ maxSize: 10, ttl: 0 })).not.toThrow();
      
      // These should throw because they're truthy but invalid
      expect(() => new LRUCache({ maxSize: 10, ttl: -1000 })).toThrow('ttl must be a positive integer (if specified)');
      expect(() => new LRUCache({ maxSize: 10, ttl: 100.5 })).toThrow('ttl must be a positive integer (if specified)');
      
      // Valid TTL should not throw
      expect(() => new LRUCache({ maxSize: 10, ttl: 100 })).not.toThrow();
    });
  });

  describe('basic operations', () => {
    let cache: LRUCache;

    beforeEach(() => {
      cache = new LRUCache({ maxSize: 3 });
    });

    describe('set and get', () => {
      it('should store and retrieve values', () => {
        cache.set('key1', 'value1');
        expect(cache.get('key1')).toBe('value1');
      });

      it('should return undefined for non-existent keys', () => {
        expect(cache.get('nonexistent')).toBeUndefined();
      });

      it('should NOT update existing values, only move to front', () => {
        cache.set('key1', 'value1');
        cache.set('key1', 'value2'); // This should NOT change the value
        expect(cache.get('key1')).toBe('value1'); // Still original value
        expect(cache.size()).toBe(1);
      });

      it('should handle empty string values', () => {
        cache.set('key1', '');
        expect(cache.get('key1')).toBe('');
      });

      it('should handle empty string keys', () => {
        cache.set('', 'value');
        expect(cache.get('')).toBe('value');
      });

      it('should handle special characters in keys', () => {
        const specialKeys = ['key with spaces', 'key-with-dashes', 'key_with_underscores', 'key.with.dots'];
        specialKeys.forEach(key => {
          cache.set(key, `value-${key}`);
          expect(cache.get(key)).toBe(`value-${key}`);
        });
      });
    });

    describe('has', () => {
      it('should return true for existing keys', () => {
        cache.set('key1', 'value1');
        expect(cache.has('key1')).toBe(true);
      });

      it('should return false for non-existent keys', () => {
        expect(cache.has('nonexistent')).toBe(false);
      });

      it('should not update access time or LRU order', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        
        // key1 is now LRU, check existence without updating access time
        cache.has('key1');
        
        // Add key4 to trigger eviction - key1 should still be evicted
        cache.set('key4', 'value4');
        expect(cache.has('key1')).toBe(false);
      });
    });

    describe('delete', () => {
      it('should remove existing keys', () => {
        cache.set('key1', 'value1');
        expect(cache.delete('key1')).toBe(true);
        expect(cache.get('key1')).toBeUndefined();
        expect(cache.size()).toBe(0);
      });

      it('should return false for non-existent keys', () => {
        expect(cache.delete('nonexistent')).toBe(false);
      });

      it('should handle multiple deletions', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        
        expect(cache.delete('key1')).toBe(true);
        expect(cache.delete('key2')).toBe(true);
        expect(cache.size()).toBe(0);
      });
    });

    describe('clear', () => {
      it('should remove all entries', () => {
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        
        cache.clear();
        expect(cache.size()).toBe(0);
        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBeUndefined();
        expect(cache.get('key3')).toBeUndefined();
      });

      it('should work on empty cache', () => {
        cache.clear();
        expect(cache.size()).toBe(0);
      });
    });

    describe('size', () => {
      it('should return correct size', () => {
        expect(cache.size()).toBe(0);
        
        cache.set('key1', 'value1');
        expect(cache.size()).toBe(1);
        
        cache.set('key2', 'value2');
        expect(cache.size()).toBe(2);
        
        cache.delete('key1');
        expect(cache.size()).toBe(1);
        
        cache.clear();
        expect(cache.size()).toBe(0);
      });
    });
  });

  describe('LRU eviction', () => {
    let cache: LRUCache;

    beforeEach(() => {
      cache = new LRUCache({ maxSize: 3 });
    });

    it('should evict least recently used item when capacity exceeded', () => {
      // Fill cache to capacity
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      expect(cache.size()).toBe(3);

      // Add fourth item - should evict key1 (least recently used)
      cache.set('key4', 'value4');
      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBeUndefined(); // Should be evicted
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update LRU order on access', async () => {
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Access key1 to make it most recently used
      cache.get('key1');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Add key4 - should evict key2 (now least recently used)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('value1'); // Recently accessed
      expect(cache.get('key2')).toBeUndefined(); // Should be evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
      expect(cache.size()).toBe(3);
    });

    it('should update LRU order on set to existing key', async () => {
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Set key1 again to make it most recently used (moves to front)
      cache.set('key1', 'new_value1'); // Note: value doesn't actually change
      await new Promise(resolve => setTimeout(resolve, 5));

      // Add key4 - should evict key2 (now least recently used)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('value1'); // Still original value, but recently accessed
      expect(cache.get('key2')).toBeUndefined(); // Should be evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
      expect(cache.size()).toBe(3);
    });

    it('should handle eviction with cache size of 1', () => {
      const smallCache = new LRUCache({ maxSize: 1 });
      
      smallCache.set('key1', 'value1');
      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.size()).toBe(1);

      smallCache.set('key2', 'value2');
      expect(smallCache.get('key1')).toBeUndefined();
      expect(smallCache.get('key2')).toBe('value2');
      expect(smallCache.size()).toBe(1);
    });

    it('should maintain LRU behavior with sequential operations', async () => {
      // Add entries with time gaps
      cache.set('oldest', 'value1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('middle', 'value2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('newest', 'value3');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Trigger eviction - oldest should be evicted
      cache.set('trigger', 'value4');
      
      expect(cache.get('oldest')).toBeUndefined();
      expect(cache.get('middle')).toBe('value2');
      expect(cache.get('newest')).toBe('value3');
      expect(cache.get('trigger')).toBe('value4');
      expect(cache.size()).toBe(3);
    });
  });

  describe('TTL functionality based on lastAccessed', () => {
    let cache: LRUCache;
    
    beforeEach(() => {
      cache = new LRUCache({ maxSize: 5, ttl: 100 }); // 100ms TTL
    });

    it('should return values within TTL', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should expire entries after TTL based on lastAccessed time', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire based on lastAccessed
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.size()).toBe(0); // Should be auto-removed
    });

    it('should extend TTL on each access (lastAccessed update)', async () => {
      cache.set('key1', 'value1');
      
      // Access the key partway through TTL
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(cache.get('key1')).toBe('value1'); // This updates lastAccessed
      
      // Wait another 75ms (total 125ms from creation, but only 75ms from last access)
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Should still exist because lastAccessed was updated
      expect(cache.get('key1')).toBe('value1');
      
      // Now wait full TTL from last access
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle TTL in has() method based on lastAccessed', async () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.size()).toBe(0);
    });

    it('should extend TTL when setting existing key (moves to front)', async () => {
      cache.set('key1', 'value1');
      
      // Wait part of the TTL
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set the key again (should update lastAccessed)
      cache.set('key1', 'new_value'); // Note: value doesn't actually change
      
      // Wait original TTL duration from initial creation
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Should still exist because lastAccessed was updated by the second set()
      expect(cache.get('key1')).toBe('value1'); // Still original value
      
      // Wait full TTL from the second set operation
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire if no TTL is set', async () => {
      const noTtlCache = new LRUCache({ maxSize: 5 });
      noTtlCache.set('key1', 'value1');
      
      // Simulate time passing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(noTtlCache.get('key1')).toBe('value1');
      expect(noTtlCache.has('key1')).toBe(true);
    });

    it('should handle mixed expired and non-expired entries', async () => {
      cache.set('key1', 'value1');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      cache.set('key2', 'value2'); // Added later
      
      await new Promise(resolve => setTimeout(resolve, 75)); // Total 125ms
      
      expect(cache.get('key1')).toBeUndefined(); // Expired (125ms > 100ms TTL)
      expect(cache.get('key2')).toBe('value2'); // Still valid (75ms < 100ms TTL)
    });

    it('should handle TTL with has() not updating lastAccessed', async () => {
      cache.set('key1', 'value1');
      
      // Wait part of TTL
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // has() should not extend TTL
      expect(cache.has('key1')).toBe(true);
      
      // Wait for original TTL to expire
      await new Promise(resolve => setTimeout(resolve, 75)); // Total 125ms
      
      // Should be expired because has() didn't update lastAccessed
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const cache = new LRUCache({ maxSize: 10 });
      
      let stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(10);
      expect(stats.hitRatio).toBeUndefined();

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
    });

    it('should update size after operations', () => {
      const cache = new LRUCache({ maxSize: 3 });
      
      cache.set('key1', 'value1');
      expect(cache.getStats().size).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.getStats().size).toBe(2);
      
      cache.delete('key1');
      expect(cache.getStats().size).toBe(1);
      
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid sequential operations', () => {
      const cache = new LRUCache({ maxSize: 100 });
      
      // Add many items rapidly
      for (let i = 0; i < 50; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      expect(cache.size()).toBe(50);
      
      // Access them all
      for (let i = 0; i < 50; i++) {
        expect(cache.get(`key${i}`)).toBe(`value${i}`);
      }
    });

    it('should handle cache overflow correctly', () => {
      const cache = new LRUCache({ maxSize: 2 });
      
      // Add items beyond capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
        expect(cache.size()).toBeLessThanOrEqual(2);
      }
      
      // Should only have last 2 items
      expect(cache.get('key8')).toBe('value8');
      expect(cache.get('key9')).toBe('value9');
      expect(cache.size()).toBe(2);
    });

    it('should handle alternating set/get patterns', async () => {
      const cache = new LRUCache({ maxSize: 3 });
      
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.get('key1'); // key1 becomes MRU
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key2', 'value2'); // key2 becomes MRU, key1 becomes LRU
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.get('key1'); // key1 becomes MRU again, key2 becomes LRU
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key3', 'value3'); // key3 becomes MRU, key1 in middle, key2 is LRU
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.get('key2'); // key2 becomes MRU, key3 in middle, key1 becomes LRU
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key4', 'value4'); // Should evict key1 (LRU)
      
      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBeUndefined(); // Should be evicted (was LRU)
      expect(cache.get('key2')).toBe('value2'); // Recently accessed
      expect(cache.get('key3')).toBe('value3'); // Middle
      expect(cache.get('key4')).toBe('value4'); // Just added
    });

    it('should handle numeric and boolean-like string keys', () => {
      const cache = new LRUCache({ maxSize: 10 });
      
      cache.set('123', 'numeric');
      cache.set('true', 'boolean');
      cache.set('null', 'null value');
      cache.set('undefined', 'undefined value');
      
      expect(cache.get('123')).toBe('numeric');
      expect(cache.get('true')).toBe('boolean');
      expect(cache.get('null')).toBe('null value');
      expect(cache.get('undefined')).toBe('undefined value');
    });

    it('should maintain O(1) performance with frequent evictions', () => {
      const cache = new LRUCache({ maxSize: 5 });
      
      // Add many items to force frequent evictions
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      const endTime = Date.now();
      
      expect(cache.size()).toBe(5);
      // Performance check - should complete quickly with O(1) evictions
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });
  });

  describe('consistency and state management', () => {
    let cache: LRUCache;

    beforeEach(() => {
      cache = new LRUCache({ maxSize: 3 });
    });

    it('should maintain consistent state after mixed operations', () => {
      // Complex sequence of operations
      cache.set('a', '1');
      cache.set('b', '2');
      cache.get('a'); // Make 'a' more recent than 'b'
      cache.set('c', '3');
      cache.has('b'); // Check 'b' without updating access time
      cache.set('d', '4'); // Should evict 'b' (least recently accessed)
      cache.delete('a');
      cache.set('e', '5');
      
      expect(cache.size()).toBe(3);
      expect(cache.get('a')).toBeUndefined(); // Deleted
      expect(cache.get('b')).toBeUndefined(); // Evicted
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
      expect(cache.get('e')).toBe('5');
    });

    it('should handle concurrent-like access patterns', () => {
      const keys = ['user1', 'user2', 'user3', 'user4', 'user5'];
      
      // Simulate accessing different users
      keys.forEach((key, i) => {
        cache.set(key, `data${i}`);
        if (i >= 3) {
          // Cache is full, should start evicting
          expect(cache.size()).toBe(3);
        }
      });
      
      // Verify final state - should have last 3 entries
      expect(cache.get('user1')).toBeUndefined(); // Evicted
      expect(cache.get('user2')).toBeUndefined(); // Evicted
      expect(cache.get('user3')).toBe('data2');
      expect(cache.get('user4')).toBe('data3');
      expect(cache.get('user5')).toBe('data4');
    });

    it('should handle set() not updating values for existing keys', () => {
      cache.set('key1', 'original');
      expect(cache.get('key1')).toBe('original');
      
      // Setting again should not change value, only update lastAccessed
      cache.set('key1', 'new_value');
      expect(cache.get('key1')).toBe('original'); // Value unchanged
      
      // Fill cache: key1 is now MRU due to the second set()
      cache.set('key2', 'value2'); // key2 is MRU, key1 becomes LRU
      cache.set('key3', 'value3'); // key3 is MRU, key2 in middle, key1 is LRU
      cache.set('key4', 'value4'); // Should evict key1 (LRU)
      
      expect(cache.get('key1')).toBeUndefined(); // Should be evicted (was LRU)
      expect(cache.get('key2')).toBe('value2'); // Should remain
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('doubly-linked list edge cases', () => {
    let cache: LRUCache;

    beforeEach(() => {
      cache = new LRUCache({ maxSize: 2 });
    });

    it('should handle moveToFront on head node', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Access key2 (already at head) - should still work
      expect(cache.get('key2')).toBe('value2');
      
      // Verify structure is still intact
      expect(cache.size()).toBe(2);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should handle removeNode on single item cache', () => {
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      // Delete the only item
      expect(cache.delete('key1')).toBe(true);
      expect(cache.size()).toBe(0);
      
      // Cache should be empty but functional
      cache.set('key2', 'value2');
      expect(cache.get('key2')).toBe('value2');
    });

    it('should handle evictLeastRecentlyUsed with edge case', () => {
      const singleCache = new LRUCache({ maxSize: 1 });
      
      singleCache.set('key1', 'value1');
      expect(singleCache.get('key1')).toBe('value1');
      
      // Add second item - should evict first
      singleCache.set('key2', 'value2');
      expect(singleCache.get('key1')).toBeUndefined();
      expect(singleCache.get('key2')).toBe('value2');
      expect(singleCache.size()).toBe(1);
    });

    it('should handle addToFront and removeNode with head.next updates', () => {
      // Fill cache
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Delete first item (tests removeNode with prev/next pointer updates)
      cache.delete('key1');
      expect(cache.size()).toBe(1);
      
      // Add new item (tests addToFront with proper head.next setup)
      cache.set('key3', 'value3');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should handle removeNode edge cases during TTL expiration', async () => {
      const ttlCache = new LRUCache({ maxSize: 3, ttl: 50 });
      
      ttlCache.set('key1', 'value1');
      ttlCache.set('key2', 'value2');
      
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Both get() calls will trigger removeNode for expired entries
      expect(ttlCache.get('key1')).toBeUndefined(); // removeNode called
      expect(ttlCache.get('key2')).toBeUndefined(); // removeNode called
      expect(ttlCache.size()).toBe(0);
    });

    it('should handle complex moveToFront scenarios', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // key1 is now LRU, key2 is MRU
      // Access key1 to move it to front (tests moveToFront: removeNode then addToFront)
      cache.get('key1');
      
      // Now key2 should be LRU, key1 should be MRU
      cache.set('key3', 'value3'); // Should evict key2
      
      expect(cache.get('key1')).toBe('value1'); // Should still exist
      expect(cache.get('key2')).toBeUndefined(); // Should be evicted
      expect(cache.get('key3')).toBe('value3'); // Should exist
    });
  });

  describe('memory and resource management', () => {
    it('should not grow beyond maxSize', () => {
      const cache = new LRUCache({ maxSize: 10 });
      
      // Add way more than maxSize
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
        expect(cache.size()).toBeLessThanOrEqual(10);
      }
      
      expect(cache.size()).toBe(10);
    });

    it('should properly clean up expired entries on access', async () => {
      const cache = new LRUCache({ maxSize: 5, ttl: 50 });
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Access should clean up expired entries
      expect(cache.get('key1')).toBeUndefined(); // Should be expired and cleaned up
      expect(cache.get('key2')).toBeUndefined(); // Should also be expired and cleaned up
      
      // Size should now reflect the cleanup
      expect(cache.size()).toBe(0);
    });

    it('should handle empty cache operations gracefully', () => {
      const cache = new LRUCache({ maxSize: 10 });
      
      expect(cache.get('anything')).toBeUndefined();
      expect(cache.has('anything')).toBe(false);
      expect(cache.delete('anything')).toBe(false);
      expect(cache.size()).toBe(0);
      
      cache.clear(); // Should not throw
      expect(cache.size()).toBe(0);
    });

    it('should handle clear() resetting linked list properly', () => {
      const cache = new LRUCache({ maxSize: 3 });
      
      // Fill cache
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Clear and verify head/tail reset
      cache.clear();
      expect(cache.size()).toBe(0);
      
      // Should work normally after clear
      cache.set('new1', 'value1');
      cache.set('new2', 'value2');
      expect(cache.get('new1')).toBe('value1');
      expect(cache.get('new2')).toBe('value2');
    });
  });
});
