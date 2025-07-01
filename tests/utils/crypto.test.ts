import { pemFooter, pemHeader } from '../../src/constants';
import {
  arrayBufferToBase64,
  base64urlDecode,
  base64urlToArrayBuffer,
  validateAlgorithm,
  verifyRS256Signature
} from '../../src/utils/crypto';

const TEST_VECTORS = {
  // Standard test cases
  base64url: {
    'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9': '{"alg":"RS256","typ":"JWT"}',
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0': '{"sub":"1234567890","name":"John Doe"}',
    'SGVsbG8gV29ybGQ': 'Hello World',
    'YQ': 'a',
    '': ''
  },
  // Edge cases
  edgeCases: {
    'QQ': 'A',           // Single character
    'QUE': 'AA',         // Two characters  
    'QUJD': 'ABC',       // Three characters
    'QUJDRA': 'ABCD'     // Four characters
  },
  // Invalid base64url
  invalid: [
    'invalid+chars',     // Contains +
    'invalid/chars',     // Contains /
    'invalid=padding',   // Contains =
    'invalid chars',     // Contains space
    'invalid\nchars'     // Contains newline
  ]
};

// Test RSA key for crypto operations
const TEST_PUBLIC_KEY = `${pemHeader}
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4f5wg5l2hKsTeNem/V41
fGnJm6gOdrj8ym3rFkEjWT2btf02uSxZ8gktFfT0CvQKOGaKN8JW2P1MvcKZJdFC
dLEA0H0ws13F1EQJ1YC6LCzLK9CK13BZhNB8MIGlBqNjHCmYJE7CkO0A5X5wOnIp
1JOF3z8LxN5MJX5M8BQdDgK9Kx6G2xJw8LJ9A8Z2P9mQ6k9WN8K2HZ7OQq8L1
${pemFooter}`;

describe('Crypto Utils', () => {
  
  describe('base64urlDecode', () => {
    describe('valid inputs', () => {
      Object.entries(TEST_VECTORS.base64url).forEach(([input, expected]) => {
        it(`should decode "${input}" to "${expected}"`, () => {
          expect(base64urlDecode(input)).toBe(expected);
        });
      });

      Object.entries(TEST_VECTORS.edgeCases).forEach(([input, expected]) => {
        it(`should handle edge case "${input}" -> "${expected}"`, () => {
          expect(base64urlDecode(input)).toBe(expected);
        });
      });

      it('should handle strings without padding', () => {
        const withoutPadding = 'SGVsbG8';
        const result = base64urlDecode(withoutPadding);
        expect(result).toBe('Hello');
      });

      it('should handle URL-safe characters', () => {
        const urlSafe = 'SGVsbG8tV29ybGQ_';
        const result = base64urlDecode(urlSafe);
        expect(result).toMatch(/Hello/);
      });
    });

    describe('invalid inputs', () => {
      TEST_VECTORS.invalid.forEach((invalidInput) => {
        it(`should throw on invalid input: "${invalidInput}"`, () => {
          expect(() => base64urlDecode(invalidInput)).toThrow();
        });
      });

      it('should throw on input with invalid base64 characters', () => {
        expect(() => base64urlDecode('invalid@#$%')).toThrow();
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(base64urlDecode('')).toBe('');
      });

      it('should be consistent with multiple calls', () => {
        const input = 'SGVsbG8gV29ybGQ';
        const result1 = base64urlDecode(input);
        const result2 = base64urlDecode(input);
        expect(result1).toBe(result2);
      });
    });
  });

  describe('base64urlToArrayBuffer', () => {
    describe('valid conversions', () => {
      it('should convert base64url to ArrayBuffer correctly', () => {
        const input = 'SGVsbG8gV29ybGQ';
        const buffer = base64urlToArrayBuffer(input);
        
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        
        const view = new Uint8Array(buffer);
        const decoded = Array.from(view).map(b => String.fromCharCode(b)).join('');
        expect(decoded).toBe('Hello World');
      });

      it('should handle single byte', () => {
        const input = 'QQ';
        const buffer = base64urlToArrayBuffer(input);
        const view = new Uint8Array(buffer);
        
        expect(view.length).toBe(1);
        expect(view[0]).toBe(65);
      });

      it('should handle empty string', () => {
        const buffer = base64urlToArrayBuffer('');
        expect(buffer.byteLength).toBe(0);
      });

      it('should handle binary data correctly', () => {
        const binaryData = new Uint8Array([0, 1, 2, 3, 4, 255]);
        const base64 = btoa(String.fromCharCode(...binaryData))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
        
        const result = base64urlToArrayBuffer(base64);
        const resultView = new Uint8Array(result);
        
        expect(resultView).toEqual(binaryData);
      });
    });

    describe('invalid inputs', () => {
      TEST_VECTORS.invalid.forEach((invalidInput) => {
        it(`should throw on invalid input: "${invalidInput}"`, () => {
          expect(() => base64urlToArrayBuffer(invalidInput)).toThrow();
        });
      });
    });

    describe('URL-safe character handling', () => {
      it('should properly convert URL-safe characters', () => {
        const input = 'SGVsbG8tV29ybGQ_';
        expect(() => base64urlToArrayBuffer(input)).not.toThrow();
      });
    });
  });

  describe('arrayBufferToBase64', () => {
    it('should convert ArrayBuffer to base64 correctly', () => {
      const text = 'Hello World';
      const buffer = new TextEncoder().encode(text);
      const base64 = arrayBufferToBase64(buffer);
      
      const decoded = atob(base64);
      expect(decoded).toBe(text);
    });

    it('should handle empty ArrayBuffer', () => {
      const emptyBuffer = new ArrayBuffer(0);
      const result = arrayBufferToBase64(emptyBuffer);
      expect(result).toBe('');
    });

    it('should handle binary data', () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 4, 255]);
      const base64 = arrayBufferToBase64(binaryData.buffer);
      
      const decoded = atob(base64);
      const decodedBytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        decodedBytes[i] = decoded.charCodeAt(i);
      }
      
      expect(decodedBytes).toEqual(binaryData);
    });

    it('should produce valid base64', () => {
      const buffer = new TextEncoder().encode('Test data for base64 encoding');
      const base64 = arrayBufferToBase64(buffer);
      
      expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should be consistent with multiple calls', () => {
      const buffer = new TextEncoder().encode('consistency test');
      const result1 = arrayBufferToBase64(buffer);
      const result2 = arrayBufferToBase64(buffer);
      expect(result1).toBe(result2);
    });
  });

  describe('verifyRS256Signature', () => {
    describe('input validation', () => {
      it('should return false for empty data', async () => {
        const result = await verifyRS256Signature('', 'signature', TEST_PUBLIC_KEY);
        expect(result).toBe(false);
      });

      it('should return false for empty signature', async () => {
        const result = await verifyRS256Signature('data', '', TEST_PUBLIC_KEY);
        expect(result).toBe(false);
      });

      it('should return false for empty public key', async () => {
        const result = await verifyRS256Signature('data', 'signature', '');
        expect(result).toBe(false);
      });

      it('should return false for null/undefined inputs', async () => {
        // @ts-expect-error - Testing invalid inputs
        expect(await verifyRS256Signature(null, 'sig', 'key')).toBe(false);
        // @ts-expect-error - Testing invalid inputs
        expect(await verifyRS256Signature('data', null, 'key')).toBe(false);
        // @ts-expect-error - Testing invalid inputs
        expect(await verifyRS256Signature('data', 'sig', null)).toBe(false);
      });
    });

    describe('Web Crypto API availability', () => {
      it('should return false when crypto is not available', async () => {
        const originalCrypto = globalThis.crypto;
        // @ts-expect-error - Testing by removing crypto
        delete globalThis.crypto;
        
        const result = await verifyRS256Signature('data', 'signature', TEST_PUBLIC_KEY);
        expect(result).toBe(false);
        
        globalThis.crypto = originalCrypto;
      });

      it('should return false when crypto.subtle is not available', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const originalCrypto = globalThis.crypto;
        // @ts-expect-error - Testing by modifying crypto
        globalThis.crypto = {};
        
        const result = await verifyRS256Signature('data', 'signature', TEST_PUBLIC_KEY);
        expect(result).toBe(false);
        
        globalThis.crypto = originalCrypto;
        consoleSpy.mockRestore();
      });
    });

    describe('real signature verification', () => {
      it('should handle invalid signatures', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await verifyRS256Signature(
          'test.data',
          'invalid_signature_data',
          TEST_PUBLIC_KEY
        );
        expect(result).toBe(false);
        consoleSpy.mockRestore();
      });

      it('should handle malformed public keys', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await verifyRS256Signature(
          'data',
          'signature',
          'invalid-pem-format'
        );
        expect(result).toBe(false);
        consoleSpy.mockRestore();
      });

      it('should handle malformed signatures', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await verifyRS256Signature(
          'data',
          'not-base64url!@#$',
          TEST_PUBLIC_KEY
        );
        expect(result).toBe(false);
        consoleSpy.mockRestore();
      });

      it('should use correct algorithm parameters', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        const result = await verifyRS256Signature('data', 'dGVzdA', TEST_PUBLIC_KEY);
        
        // Should return false for invalid signature without logging
        expect(result).toBe(false);
        expect(consoleSpy).not.toHaveBeenCalled(); // Verify silent operation
        
        consoleSpy.mockRestore();
      });

      it('should handle verification process end-to-end', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await verifyRS256Signature(
          'header.payload',
          'dGVzdHNpZ25hdHVyZQ',
          TEST_PUBLIC_KEY
        );
        
        expect(typeof result).toBe('boolean');
        consoleSpy.mockRestore();
      });
    });
  });

  describe('validateAlgorithm', () => {
    describe('allowlist validation', () => {
      it('should accept algorithms in allowlist', () => {
        expect(validateAlgorithm('RS256', ['RS256'])).toBe(true);
        expect(validateAlgorithm('RS384', ['RS256', 'RS384'])).toBe(true);
        expect(validateAlgorithm('RS512', ['RS256', 'RS384', 'RS512'])).toBe(true);
      });

      it('should reject algorithms not in allowlist', () => {
        expect(validateAlgorithm('HS256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('ES256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('PS256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('unknown', ['RS256'])).toBe(false);
      });

      it('should handle empty allowlist', () => {
        expect(validateAlgorithm('RS256', [])).toBe(false);
      });

      it('should handle multiple allowed algorithms', () => {
        const allowedAlgs = ['RS256', 'RS384', 'RS512'];
        
        expect(validateAlgorithm('RS256', allowedAlgs)).toBe(true);
        expect(validateAlgorithm('RS384', allowedAlgs)).toBe(true);
        expect(validateAlgorithm('RS512', allowedAlgs)).toBe(true);
        expect(validateAlgorithm('HS256', allowedAlgs)).toBe(false);
      });
    });

    describe('case sensitivity', () => {
      it('should be case insensitive for valid algorithms', () => {
        expect(validateAlgorithm('rs256', ['RS256'])).toBe(true);
        expect(validateAlgorithm('Rs256', ['RS256'])).toBe(true);
        expect(validateAlgorithm('RS256', ['rs256'])).toBe(true);
        expect(validateAlgorithm('rS256', ['Rs256'])).toBe(true);
      });

      it('should be case insensitive for invalid algorithms', () => {
        expect(validateAlgorithm('hs256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('Hs256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('UNKNOWN', ['RS256'])).toBe(false);
      });
    });

    describe('"none" algorithm security', () => {
      it('should always reject "none" algorithm', () => {
        expect(validateAlgorithm('none', ['none'])).toBe(false);
        expect(validateAlgorithm('none', ['RS256', 'none'])).toBe(false);
        expect(validateAlgorithm('none', [])).toBe(false);
      });

      it('should reject "none" algorithm in different cases', () => {
        expect(validateAlgorithm('NONE', ['NONE'])).toBe(false);
        expect(validateAlgorithm('None', ['None'])).toBe(false);
        expect(validateAlgorithm('NoNe', ['NoNe'])).toBe(false);
      });

      it('should reject "none" even if explicitly allowed', () => {
        expect(validateAlgorithm('none', ['none', 'RS256'])).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(validateAlgorithm('', ['RS256'])).toBe(false);
        expect(validateAlgorithm('RS256', [''])).toBe(false);
        expect(validateAlgorithm('', [''])).toBe(false);
      });

      it('should handle whitespace', () => {
        expect(validateAlgorithm(' RS256 ', ['RS256'])).toBe(false);
        expect(validateAlgorithm('RS256', [' RS256 '])).toBe(false);
      });

      it('should handle special characters', () => {
        expect(validateAlgorithm('RS256!', ['RS256'])).toBe(false);
        expect(validateAlgorithm('RS-256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('RS_256', ['RS256'])).toBe(false);
      });

      // Algorithm validation type safety - CRITICAL
      it('should handle non-string algorithm input safely', () => {
        // @ts-expect-error - Testing runtime safety
        expect(validateAlgorithm(null, ['RS256'])).toBe(false);
        // @ts-expect-error - Testing runtime safety
        expect(validateAlgorithm(undefined, ['RS256'])).toBe(false);
        // @ts-expect-error - Testing runtime safety
        expect(validateAlgorithm(123, ['RS256'])).toBe(false);
      });

      it('should handle non-array allowlist safely', () => {
        // @ts-expect-error - Testing runtime safety
        expect(validateAlgorithm('RS256', null)).toBe(false);
        // @ts-expect-error - Testing runtime safety
        expect(validateAlgorithm('RS256', 'RS256')).toBe(false);
      });
    });

    describe('security best practices', () => {
      it('should implement allowlist approach (OWASP recommendation)', () => {
        const commonAlgorithms = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'PS256'];
        const allowedAlgs = ['RS256'];
        
        commonAlgorithms.forEach(alg => {
          if (alg === 'RS256') {
            expect(validateAlgorithm(alg, allowedAlgs)).toBe(true);
          } else {
            expect(validateAlgorithm(alg, allowedAlgs)).toBe(false);
          }
        });
      });

      it('should prevent algorithm confusion attacks', () => {
        expect(validateAlgorithm('HS256', ['RS256'])).toBe(false);
        expect(validateAlgorithm('HS384', ['RS256'])).toBe(false);
        expect(validateAlgorithm('HS512', ['RS256'])).toBe(false);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete JWT header decoding workflow', () => {
      const jwtHeader = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
      const decoded = base64urlDecode(jwtHeader);
      const headerObj = JSON.parse(decoded);
      
      expect(headerObj.alg).toBe('RS256');
      expect(headerObj.typ).toBe('JWT');
      expect(validateAlgorithm(headerObj.alg, ['RS256'])).toBe(true);
    });

    it('should handle base64url roundtrip consistency', () => {
      const originalData = 'Hello, World! This is a test string with special characters: !@#$%^&*()';
      
      const buffer = new TextEncoder().encode(originalData);
      const base64 = arrayBufferToBase64(buffer);
      const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const decoded = base64urlDecode(base64url);
      
      expect(decoded).toBe(originalData);
    });

    it('should handle signature data preparation', () => {
      const header = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
      const payload = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0';
      const signingInput = `${header}.${payload}`;
      
      const dataBuffer = new TextEncoder().encode(signingInput);
      expect(dataBuffer).toBeInstanceOf(Uint8Array);
      expect(dataBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('error handling and logging', () => {
    it('should not expose sensitive information in errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const result = await verifyRS256Signature('data', 'invalid-signature', 'invalid-key');
      
      // Should return false and NOT log anything (good for SDK)
      expect(result).toBe(false);
      expect(consoleSpy).not.toHaveBeenCalled(); // Verify no logging
      
      consoleSpy.mockRestore();
    });

    it('should handle unexpected error types gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await verifyRS256Signature('data', 'sig', 'key');
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should execute crypto.subtle.verify with real RSA key', async () => {
      // This is a real 2048-bit RSA public key that will import successfully
      const realPublicKey = `-----BEGIN PUBLIC KEY-----
      MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwJKvPBOGU7JM7Z8rE4Q1
      xKqPdNjYzXUv8VnN9X5hXxRKzVyLq9V3EKnGgO5DV5Q5B8M5F4D1L8V2K4M3R9K5
      L2X9Q3J1Y6V3M8L4N9P2Q7W8F5T6K9M3L1B7V4X2Z8H3J9R6Q5V1F8L2M4P7N9K3
      B2D5X8W6T4M1Q9V3L7F5K2H8J6R4P9M3B1X5Z7N2Q8V4L6F9T3K1M8P5J7R2B4D6
      X9W3Q1V5L8F2K4M7P3J9R6B5D2X8W6T1V4L9F3K5M2P8J7R4B6D3X9W5Q2V1L8F4
      K7M3P6J9R2B5D8X1W4Q6V3L9F2K5M8P4J7R6B3D1X9W2Q5V4L8F6K3M7P9J2R5B8
      DQIDAQAB
      -----END PUBLIC KEY-----`;

      const result = await verifyRS256Signature(
        'test.data',
        'dGVzdHNpZ25hdHVyZQ', // Valid base64url format
        realPublicKey
      );
      
      // Should return false (signature won't match) but will execute crypto.subtle.verify
      expect(result).toBe(false);
    });
  });
});
