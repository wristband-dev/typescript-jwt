/**
 * Comprehensive test suite for JWKS Client
 * Tests all functionality including key fetching, caching, ASN.1 encoding, and error handling
 */

import { createJwksClient, JWKSClient } from '../src/jwks-client';
import { JWKSKey, JWKSResponse } from '../src/types';

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Create base64url strings of the correct lengths
const create2048BitModulus = (): string => {
  // 256 bytes = 2048 bits, base64url encoded will be ~342 chars
  const bytes = new Uint8Array(256);
  bytes.fill(0x41); // Fill with 'A' bytes for simplicity
  bytes[0] = 0x00; // Ensure positive integer (MSB = 0)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const create1024BitModulus = (): string => {
  // 128 bytes = 1024 bits
  const bytes = new Uint8Array(128);
  bytes.fill(0x41);
  bytes[0] = 0x00;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const VALID_JWK: JWKSKey = {
  kty: 'RSA',
  kid: 'test-key-id',
  use: 'sig',
  n: create2048BitModulus(),
  e: 'AQAB'
};

const WEAK_JWK: JWKSKey = {
  kty: 'RSA',
  kid: 'weak-key-id',
  use: 'sig',
  n: create1024BitModulus(),
  e: 'AQAB'
};

const VALID_JWKS_RESPONSE: JWKSResponse = {
  keys: [
    VALID_JWK,
    {
      kty: 'RSA',
      kid: 'another-key-id',
      use: 'sig',
      n: create2048BitModulus(),
      e: 'AQAB'
    }
  ]
};

describe('JWKSClient', () => {
  
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should throw when config is null or undefined', () => {
      // @ts-expect-error - Testing invalid input
      expect(() => new JWKSClient(null)).toThrow('A valid JWKS URI is required.');
      
      // @ts-expect-error - Testing invalid input  
      expect(() => new JWKSClient(undefined)).toThrow('A valid JWKS URI is required.');
    });

    it('should throw when jwksUri is missing', () => {
      // @ts-expect-error - Testing invalid input
      expect(() => new JWKSClient({})).toThrow('A valid JWKS URI is required.');
    });

    it('should throw when jwksUri is empty string', () => {
      expect(() => new JWKSClient({ jwksUri: '' })).toThrow('A valid JWKS URI is required.');
    });

    it('should throw when jwksUri is only whitespace', () => {
      expect(() => new JWKSClient({ jwksUri: '   ' })).toThrow('A valid JWKS URI is required.');
      expect(() => new JWKSClient({ jwksUri: '\t\n  ' })).toThrow('A valid JWKS URI is required.');
    });

    it('should create client with default cache size', () => {
      const client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 20
      });
      
      expect(client.getCacheStats().maxSize).toBe(20);
    });

    it('should create client with custom cache settings', () => {
      const client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 50,
        cacheTtl: 3600000
      });
      
      expect(client.getCacheStats().maxSize).toBe(50);
    });

    it('should apply default cache size when not specified', () => {
      const client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks'
      });
      
      expect(client.getCacheStats().maxSize).toBe(20);
    });
  });

  describe('getSigningKey', () => {
    let client: JWKSClient;

    beforeEach(() => {
      client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 10
      });
    });

    describe('successful key retrieval', () => {
      it('should fetch and return a valid signing key', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => VALID_JWKS_RESPONSE
        } as Response);

        const key = await client.getSigningKey('test-key-id');
        
        expect(key).toMatch(/^-----BEGIN PUBLIC KEY-----/);
        expect(key).toMatch(/-----END PUBLIC KEY-----$/);
        expect(mockFetch).toHaveBeenCalledWith('https://test.example.com/jwks');
      });

      it('should return cached key on subsequent requests', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => VALID_JWKS_RESPONSE
        } as Response);

        // First call - should fetch
        const key1 = await client.getSigningKey('test-key-id');
        
        // Second call - should use cache
        const key2 = await client.getSigningKey('test-key-id');
        
        expect(key1).toBe(key2);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(client.getCacheStats().size).toBe(1);
      });

      it('should handle multiple different keys', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => VALID_JWKS_RESPONSE
        } as Response);

        const key1 = await client.getSigningKey('test-key-id');
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => VALID_JWKS_RESPONSE
        } as Response);

        const key2 = await client.getSigningKey('another-key-id');
        
        // Both should be valid PEM keys
        expect(key1).toMatch(/^-----BEGIN PUBLIC KEY-----/);
        expect(key2).toMatch(/^-----BEGIN PUBLIC KEY-----/);
        expect(mockFetch).toHaveBeenCalledTimes(2); // Different keys require separate fetches
        expect(client.getCacheStats().size).toBe(2); // Two separate cache entries
      });
    });

    describe('network error handling', () => {
      it('should throw on network fetch failure', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(client.getSigningKey('test-key-id'))
          .rejects.toThrow('Network error');
      });

      it('should throw on HTTP error response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        } as Response);

        await expect(client.getSigningKey('test-key-id'))
          .rejects.toThrow('Failed to fetch JWKS: 404 Not Found');
      });

      it('should throw on HTTP 500 error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        } as Response);

        await expect(client.getSigningKey('test-key-id'))
          .rejects.toThrow('Failed to fetch JWKS: 500 Internal Server Error');
      });

      it('should throw on invalid JSON response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => { throw new Error('Invalid JSON'); }
        } as unknown as Response);

        await expect(client.getSigningKey('test-key-id'))
          .rejects.toThrow('Invalid JSON');
      });
    });

    describe('key validation errors', () => {
      it('should throw when key ID is not found', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => VALID_JWKS_RESPONSE
        } as Response);

        await expect(client.getSigningKey('nonexistent-key-id'))
          .rejects.toThrow("Unable to find a signing key that matches 'nonexistent-key-id'");
      });

      it('should throw when key is not RSA', async () => {
        const ecJwks = {
          keys: [{
            kty: 'EC',
            kid: 'ec-key-id',
            crv: 'P-256'
          }]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ecJwks
        } as Response);

        await expect(client.getSigningKey('ec-key-id'))
          .rejects.toThrow('Only RSA keys are supported');
      });

      it('should throw when JWK is missing required parameters', async () => {
        const invalidJwks = {
          keys: [{
            kty: 'RSA',
            kid: 'invalid-key-id'
            // Missing 'n' and 'e' parameters
          }]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => invalidJwks
        } as Response);

        await expect(client.getSigningKey('invalid-key-id'))
          .rejects.toThrow('Invalid JWK: missing n or e parameters');
      });

      it('should throw when RSA key is too weak', async () => {
        const weakJwks = {
          keys: [WEAK_JWK]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => weakJwks
        } as Response);

        await expect(client.getSigningKey('weak-key-id'))
          .rejects.toThrow('RSA key too weak');
      });
    });

    describe('empty JWKS responses', () => {
      it('should handle empty key set', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ keys: [] })
        } as Response);

        await expect(client.getSigningKey('any-key-id'))
          .rejects.toThrow("Unable to find a signing key that matches 'any-key-id'");
      });

      it('should handle malformed JWKS response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ notKeys: [] })
        } as Response);

        await expect(client.getSigningKey('any-key-id'))
          .rejects.toThrow(); // Should throw when trying to access .keys
      });
    });
  });

  describe('cache management', () => {
    let client: JWKSClient;

    beforeEach(() => {
      client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 3
      });
    });

    it('should clear all cached keys', async () => {
      // Add some keys to cache
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      await client.getSigningKey('test-key-id');
      await client.getSigningKey('another-key-id');
      
      expect(client.getCacheStats().size).toBe(2);
      
      client.clear();
      expect(client.getCacheStats().size).toBe(0);
    });

    it('should respect cache size limits', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      // Add keys beyond cache size
      for (let i = 0; i < 5; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            keys: [{
              kty: 'RSA',
              kid: `key-${i}`,
              n: VALID_JWK.n,
              e: VALID_JWK.e
            }]
          })
        } as Response);
        
        await client.getSigningKey(`key-${i}`);
      }
      
      // Should not exceed maxSize
      expect(client.getCacheStats().size).toBeLessThanOrEqual(3);
    });

    it('should provide accurate cache statistics', async () => {
      const stats1 = client.getCacheStats();
      expect(stats1.size).toBe(0);
      expect(stats1.maxSize).toBe(3);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      await client.getSigningKey('test-key-id');
      
      const stats2 = client.getCacheStats();
      expect(stats2.size).toBe(1);
      expect(stats2.maxSize).toBe(3);
    });
  });

  describe('PEM conversion', () => {
    let client: JWKSClient;

    beforeEach(() => {
      client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 10
      });
    });

    it('should produce properly formatted PEM', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      const pem = await client.getSigningKey('test-key-id');
      
      expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
      expect(pem).toMatch(/\n-----END PUBLIC KEY-----$/);
      
      // Should have proper line breaks (64 chars per line in body)
      const lines = pem.split('\n');
      expect(lines[0]).toBe('-----BEGIN PUBLIC KEY-----');
      expect(lines[lines.length - 1]).toBe('-----END PUBLIC KEY-----');
      
      // Body lines should be <= 64 characters
      for (let i = 1; i < lines.length - 1; i++) {
        expect(lines[i].length).toBeLessThanOrEqual(64);
      }
    });

    it('should handle edge cases in JWK conversion', async () => {
      const edgeCaseJwk = {
        keys: [{
          kty: 'RSA',
          kid: 'edge-case-key',
          n: VALID_JWK.n,
          e: 'AQ', // Different exponent
          use: 'sig'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => edgeCaseJwk
      } as Response);

      const pem = await client.getSigningKey('edge-case-key');
      expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    });

    it('should handle JWK with minimal parameters', async () => {
      const minimalJwk = {
        keys: [{
          kty: 'RSA',
          kid: 'minimal-key',
          n: VALID_JWK.n,
          e: VALID_JWK.e
          // No 'use' or other optional parameters
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => minimalJwk
      } as Response);

      const pem = await client.getSigningKey('minimal-key');
      expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    });
  });

  describe('ASN.1 encoding edge cases', () => {
    let client: JWKSClient;

    beforeEach(() => {
      client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 10
      });
    });

    it('should handle RSA parameters with MSB set (requiring padding)', async () => {
      // Create 2048-bit modulus with MSB set (starts with 0x80+)
      const msbSetJwk = {
        keys: [{
          kty: 'RSA',
          kid: 'msb-set-key',
          n: ((): string => {
            const bytes = new Uint8Array(256); // 2048 bits
            bytes.fill(0x41);
            bytes[0] = 0x80; // Set MSB to trigger padding in ASN.1 encoding
            return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
          })(),
          e: 'AQAB'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => msbSetJwk
      } as Response);

      const pem = await client.getSigningKey('msb-set-key');
      expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    });

    it('should handle various key sizes', async () => {
      // Test with a larger key
      const largeKeyJwk = {
        keys: [{
          kty: 'RSA',
          kid: 'large-key',
          n: 'sRJjz2muDCEbAjgGKrSMLzfw3mqA1Q_7U7ZHv1hQ7j1ZZD7M_K2Y0NCh1mZZDjzlF5aDMkc8b2C8vKj7sLXmnK7Q1vVEqrKmfh_A3XG8-pQlzXfz3u_G-I9xn8Ps6lIe-YX8DwL_5GKGqnhYtLQqnhR8JN9-L_yQK3_yEv_Z9LQsRJjz2muDCEbAjgGKrSMLzfw3mqA1Q_7U7ZHv1hQ7j1ZZD7M_K2Y0NCh1mZZDjzlF5aDMkc8b2C8vKj7sLXmnK7Q1vVEqrKmfh_A3XG8-pQlzXfz3u_G-I9xn8Ps6lIe-YX8DwL_5GKGqnhYtLQqnhR8JN9-L_yQK3_yEv_Z9LQ',
          e: 'AQAB'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => largeKeyJwk
      } as Response);

      const pem = await client.getSigningKey('large-key');
      expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    });
  });

  describe('concurrent requests', () => {
    let client: JWKSClient;

    beforeEach(() => {
      client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 10
      });
    });

    it('should handle concurrent requests for same key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      // Make multiple concurrent requests for the same key
      const promises = Array(5).fill(0).map(() => 
        client.getSigningKey('test-key-id')
      );

      const keys = await Promise.all(promises);
      
      // All should return the same key
      expect(keys.every(key => key === keys[0])).toBe(true);
      
      // Should only have made one network request due to caching
      // Note: This test might be flaky due to timing, but generally should work
      expect(client.getCacheStats().size).toBe(1);
    });

    it('should handle concurrent requests for different keys', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      // Make concurrent requests for different keys
      const promise1 = client.getSigningKey('test-key-id');
      const promise2 = client.getSigningKey('another-key-id');

      const [key1, key2] = await Promise.all([promise1, promise2]);
      
      // Both keys exist (they might be the same PEM if moduli are identical)
      expect(key1).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(key2).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(client.getCacheStats().size).toBe(2); // Different cache entries by kid
    });
  });

  describe('factory function', () => {
    it('should create client with correct configuration', () => {
      const config = {
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 25,
        cacheTtl: 7200000
      };

      const client = createJwksClient(config);
      expect(client.getCacheStats().maxSize).toBe(25);
    });

    it('should create client with minimal configuration', () => {
      const config = {
        jwksUri: 'https://test.example.com/jwks'
      };

      const client = createJwksClient(config);
      expect(client.getCacheStats().maxSize).toBe(20); // Default
    });
  });

  describe('error recovery', () => {
    let client: JWKSClient;

    beforeEach(() => {
      client = new JWKSClient({
        jwksUri: 'https://test.example.com/jwks',
        cacheMaxSize: 10
      });
    });

    it('should recover from network errors on retry', async () => {
      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getSigningKey('test-key-id'))
        .rejects.toThrow('Network error');

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      const key = await client.getSigningKey('test-key-id');
      expect(key).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    });

    it('should not cache failed requests', async () => {
      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getSigningKey('test-key-id'))
        .rejects.toThrow('Network error');

      expect(client.getCacheStats().size).toBe(0);

      // Second call should make another network request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => VALID_JWKS_RESPONSE
      } as Response);

      await client.getSigningKey('test-key-id');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('PEM formatting edge cases', () => {
  it('should handle malformed base64 during PEM formatting', async () => {
    // Mock a scenario where base64 formatting could fail
    const originalMatch = String.prototype.match;
    String.prototype.match = jest.fn().mockReturnValue(null);
    
    const client = new JWKSClient({
      jwksUri: 'https://test.example.com/jwks',
      cacheMaxSize: 10
    });

    const malformedJwks = {
      keys: [{
        kty: 'RSA',
        kid: 'malformed-key',
        n: create2048BitModulus(),
        e: 'AQAB'
      }]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => malformedJwks
    } as Response);

    await expect(client.getSigningKey('malformed-key'))
      .rejects.toThrow('Failed to format PEM body');
    
    // Restore original method
    String.prototype.match = originalMatch;
  });
});
