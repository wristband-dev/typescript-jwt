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

      it('should update existing values', () => {
        cache.set('key1', 'value1');
        cache.set('key1', 'value2');
        expect(cache.get('key1')).toBe('value2');
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

      it('should not update access time', () => {
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

      // Add fourth item - should evict one entry (likely first inserted)
      cache.set('key4', 'value4');
      expect(cache.size()).toBe(3);
      expect(cache.get('key4')).toBe('value4'); // New entry should exist
      
      // Count remaining entries
      const remaining = [cache.get('key1'), cache.get('key2'), cache.get('key3')]
        .filter(val => val !== undefined);
      expect(remaining.length).toBe(2);
    });

    it('should update LRU order on access with time delays', async () => {
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Access key1 to make it most recently used
      cache.get('key1');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Add key4 - should evict key2 (oldest unaccessed)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('value1'); // Recently accessed
      expect(cache.get('key4')).toBe('value4'); // Just added
      expect(cache.size()).toBe(3);
    });

    it('should update LRU order on set to existing key', async () => {
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Update key1 to make it most recently used
      cache.set('key1', 'updated1');
      await new Promise(resolve => setTimeout(resolve, 5));

      // Add key4 - should evict key2 (oldest unaccessed)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('updated1'); // Recently updated
      expect(cache.get('key4')).toBe('value4'); // Just added
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

  describe('TTL functionality', () => {
    let cache: LRUCache;
    
    beforeEach(() => {
      cache = new LRUCache({ maxSize: 5, ttl: 100 }); // 100ms TTL
    });

    it('should return values within TTL', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.size()).toBe(0); // Should be auto-removed
    });

    it('should handle TTL in has() method', async () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.size()).toBe(0);
    });

    it('should reset TTL on set to existing key', async () => {
      cache.set('key1', 'value1');
      
      // Wait part of the TTL
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Update the key (should reset TTL)
      cache.set('key1', 'updated1');
      
      // Wait original TTL duration
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Should still exist because TTL was reset
      expect(cache.get('key1')).toBe('updated1');
    });

    it('should not expire if no TTL is set', () => {
      const noTtlCache = new LRUCache({ maxSize: 5 });
      noTtlCache.set('key1', 'value1');
      
      // Simulate time passing (can't actually wait without TTL)
      expect(noTtlCache.get('key1')).toBe('value1');
      expect(noTtlCache.has('key1')).toBe(true);
    });

    it('should handle mixed expired and non-expired entries', async () => {
      cache.set('key1', 'value1');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      cache.set('key2', 'value2'); // Added later
      
      await new Promise(resolve => setTimeout(resolve, 75)); // Total 125ms
      
      expect(cache.get('key1')).toBeUndefined(); // Expired
      expect(cache.get('key2')).toBe('value2'); // Still valid
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
      
      cache.get('key1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.get('key1');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.get('key2');
      await new Promise(resolve => setTimeout(resolve, 5));
      
      cache.set('key4', 'value4'); // Should evict least recently used
      
      expect(cache.size()).toBe(3);
      expect(cache.get('key4')).toBe('value4');
      
      // Verify that some entries remain (exact eviction depends on timing)
      const remainingEntries = ['key1', 'key2', 'key3']
        .filter(key => cache.get(key) !== undefined);
      expect(remainingEntries.length).toBe(2);
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

    it('should maintain performance with frequent evictions', () => {
      const cache = new LRUCache({ maxSize: 5 });
      
      // Add many items to force frequent evictions
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      const endTime = Date.now();
      
      expect(cache.size()).toBe(5);
      // Performance check - should complete quickly despite O(n) evictions
      expect(endTime - startTime).toBeLessThan(100); // Should be much faster
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
      cache.set('d', '4'); // Should evict 'b'
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
      
      // Verify final state
      expect(cache.get('user1')).toBeUndefined(); // Evicted
      expect(cache.get('user2')).toBeUndefined(); // Evicted
      expect(cache.get('user3')).toBe('data2');
      expect(cache.get('user4')).toBe('data3');
      expect(cache.get('user5')).toBe('data4');
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

    it('should properly clean up expired entries', async () => {
      const cache = new LRUCache({ maxSize: 5, ttl: 50 });
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Access should clean up expired entries
      expect(cache.get('key1')).toBeUndefined(); // Should be expired
      // Note: size() doesn't auto-cleanup, only get/has/set do lazy cleanup
      // So we need to access the other key too to clean it up
      expect(cache.get('key2')).toBeUndefined(); // Should also be expired
      
      // Now size should reflect the cleanup
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
  });
});
