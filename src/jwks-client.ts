import { JWKSClientConfig, JWKSKey, JWKSResponse } from './types';
import {  arrayBufferToBase64, base64urlToArrayBuffer } from './utils/crypto';
import { LRUCache } from './utils/cache';
import { jwksMaxAttempts, jwksRetryDelayMs, pemFooter, pemHeader } from './constants';

/**
 * Internal JWKS (JSON Web Key Set) client for fetching Wristband keys.
 * 
 * This client handles the complexities of JWKS key retrieval, validation, conversion, and caching
 * for JWT signature verification. It implements security best practices including key strength
 * validation, proper ASN.1 encoding, and efficient LRU caching to minimize network requests.
 * 
 * Key features:
 * - **Automatic key fetching** from Wristband JWKS endpoint
 * - **LRU caching** with configurable TTL to reduce network overhead
 * - **Security validation** ensuring keys meet OWASP strength requirements (≥2048-bit RSA)
 * - **Format conversion** from JWK to PEM format for Web Crypto API compatibility
 * - **Error handling** with descriptive messages for debugging
 * 
 * The client is designed for internal use by the JWT validator and handles all the low-level
 * details of JWKS protocol compliance and cryptographic key management.
 * 
 * @internal This class is not intended for direct external use
 */
export class JWKSClient {
  /**
   * LRU cache instance for storing converted PEM keys.
   */
  private cache: LRUCache;
  /**
   * The URI endpoint for fetching the JSON Web Key Set.
   */
  private jwksUri: string;

  /**
   * Creates a new JWKS client with the specified configuration. Initializes the internal LRU cache
   * with the provided size and TTL settings. The cache stores converted PEM keys indexed by their
   * key ID (kid) for fast retrieval.
   * 
   * @param config - Configuration object specifying JWKS endpoint and cache settings
   * 
   * @example
   * ```typescript
   * const client = new JWKSClient({
   *   jwksUri: 'https://myapp.wristband.dev/api/v1/oauth2/jwks',
   *   cacheMaxSize: 10,
   *   cacheTtl: 7889238000 // 3 months
   * });
   * ```
   */
  constructor(config: JWKSClientConfig) {
    if (!config?.jwksUri?.trim()) {
      throw new Error('A valid JWKS URI is required.');
    }
    this.jwksUri = config.jwksUri;
    // Undefined TTL = cached indefinitely
    this.cache = new LRUCache({ maxSize: config.cacheMaxSize ?? 20, ttl: config.cacheTtl });
  }

  /**
   * Retrieves a signing key by its key ID, with automatic caching and format conversion.
   * 
   * This method implements the complete JWKS key retrieval workflow:
   * 1. Check LRU cache for previously converted key
   * 2. If not cached, fetch complete JWKS from Wristband
   * 3. Find the specific key by ID within the key set
   * 4. Validate key type and cryptographic strength
   * 5. Convert from JWK format to PEM format for Web Crypto API
   * 6. Cache the converted key for future use
   * 7. Return the PEM-formatted public key
   * 
   * @param kid - The key ID (kid) to retrieve from the JWKS endpoint
   * @returns Promise resolving to the public key in PEM format
   * 
   * @throws {Error} If JWKS fetch fails, key not found, non-RSA key, weak key (<2048 bits), or PEM conversion fails.
   * 
   * @example
   * ```typescript
   * try {
   *   const publicKey = await client.getSigningKey('kid-abc123');
   *   // publicKey is now in PEM format ready for crypto.subtle.importKey()
   *   console.log('Retrieved key for verification');
   * } catch (error) {
   *   if (error.message.includes('Unable to find')) {
   *     console.error('Key ID not found in JWKS');
   *   } else if (error.message.includes('RSA key too weak')) {
   *     console.error('Key does not meet security requirements');
   *   } else {
   *     console.error('JWKS fetch failed:', error.message);
   *   }
   * }
   * ```
   */
  async getSigningKey(kid: string): Promise<string> {
    // Check cache first using proper LRU cache
    const cachedKey = this.cache.get(kid);
    if (cachedKey) {
      return cachedKey;
    }

    // Fetch JWKS from Wristband
    const jwks = await this.fetchJwksWithRetry();
    const jwk = jwks.keys.find(k => k.kid === kid);
    
    if (!jwk) {
      throw new Error(`Unable to find a signing key that matches '${kid}'`);
    }

    if (jwk.kty !== 'RSA') {
      throw new Error('Only RSA keys are supported');
    }

    // Convert JWK to PEM
    const publicKey = this.jwkToPem(jwk);

    // Cache the key using LRU cache
    this.cache.set(kid, publicKey);

    return publicKey;
  }

  /**
   * Clears all cached keys from the internal cache.
   * 
   * Useful for testing scenarios or when a complete cache invalidation is needed,
   * such as during key rotation events or security incidents.
   * 
   * @example
   * ```typescript
   * // Clear cache during testing
   * beforeEach(() => {
   *   client.clear();
   * });
   * 
   * // Emergency cache flush during security incident
   * if (securityIncident) {
   *   client.clear();
   *   console.log('JWKS cache cleared for security');
   * }
   * ```
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns cache statistics for monitoring and debugging purposes.
   * 
   * Provides insights into cache utilization, which can be useful for:
   * - Performance monitoring and optimization
   * - Capacity planning for cache size configuration
   * - Debugging cache behavior in production
   * 
   * @returns Object containing current cache statistics
   * 
   * @example
   * ```typescript
   * const stats = client.getCacheStats();
   * console.log(`JWKS cache: ${stats.size}/${stats.maxSize} entries`);
   * 
   * // Monitor cache efficiency
   * if (stats.size >= stats.maxSize * 0.9) {
   *   console.warn('JWKS cache nearing capacity');
   * }
   * 
   * // Log for observability
   * logger.info('JWKS cache statistics', stats);
   * ```
   */
  getCacheStats(): { size: number; maxSize: number; hitRatio?: number; } {
    return this.cache.getStats();
  }

   /**
   * Fetches JWKS from the endpoint with retry logic. Attempts up to 3 times with 100ms delay between attempts.
   * 
   * @private
   * @returns Promise resolving to the JWKS response
   * @throws {Error} If all retry attempts fail
   */
  private async fetchJwksWithRetry(): Promise<JWKSResponse> {
    for (let attempt = 1; attempt <= jwksMaxAttempts; attempt++) {
      try {
        const response = await fetch(this.jwksUri);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json() as unknown as JWKSResponse;
      } catch (error) {
        const isLastAttempt = attempt === jwksMaxAttempts;

        if (isLastAttempt) {
          throw new Error(`Failed to fetch JWKS after ${jwksMaxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, jwksRetryDelayMs));
      }
    }
    
    // This should never be reached (appeasing Typescript)
    throw new Error('Unexpected error in JWKS fetch retry logic');
  }

  /**
   * Converts a JSON Web Key (JWK) to PEM format for Web Crypto API compatibility.
   *
   * The conversion includes:
   * - Security validation of key strength
   * - Proper ASN.1 DER encoding of RSA parameters
   * - PEM formatting with correct headers and line breaks
   * 
   * Security features:
   * - Validates RSA key strength (minimum 2048 bits per OWASP)
   * - Ensures required JWK parameters (n, e) are present
   * - Implements proper cryptographic encoding standards
   * 
   * @param jwk - The JSON Web Key to convert
   * @returns PEM-formatted RSA public key string
   * 
   * @throws {Error} If required JWK parameters (n, e) are missing, RSA key is below
   * 2048-bit minimum security requirement, or PEM formatting fails.
   * 
   * @private This method is used internally by getSigningKey()
   * 
   * @example
   * ```typescript
   * // Internal usage - converts JWK like this:
   * const jwk = {
   *   alg: 'RSA256',
   *   kty: 'RSA',
   *   kid: 'abc123',
   *   n: '<base64url-encoded-modulus>',
   *   e: 'AQAB',
   *   use: 'sig'
   * };
   * 
   * // To PEM format like this:
   * // -----BEGIN PUBLIC KEY-----
   * // MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
   * // -----END PUBLIC KEY-----
   * ```
   */
  private jwkToPem(jwk: JWKSKey): string {
    if (!jwk.n || !jwk.e) {
      throw new Error('Invalid JWK: missing n or e parameters');
    }

    // Validate key strength
    const nBuffer = base64urlToArrayBuffer(jwk.n);
    const keyBitLength = nBuffer.byteLength * 8;
    if (keyBitLength < 2048) {
      throw new Error(`RSA key too weak: ${keyBitLength} bits. 2048 bits minimum required.`);
    }

    // Convert JWK to proper ASN.1 DER format, then to PEM.
    const derBytes = this.createRSAPublicKeyDER(nBuffer, base64urlToArrayBuffer(jwk.e));
    const base64Der = arrayBufferToBase64(derBytes);
    
    // Format as proper PEM with line breaks every 64 characters
    const pemBody = base64Der.match(/.{1,64}/g)?.join('\n');
    if (!pemBody) {
      throw new Error('Failed to format PEM body');
    }
    
    return `${pemHeader}\n${pemBody}\n${pemFooter}`;
  }

  /**
   * Encodes an integer value in ASN.1 DER format. ASN.1 integers must be positive, so a padding byte (0x00)
   * is added if the most significant bit is set to prevent interpretation as negative.
   * 
   * @param bytes - The integer bytes to encode
   * @returns ASN.1 DER encoded integer (tag + length + value)
   * @private
   */
  private encodeInteger(bytes: Uint8Array): Uint8Array {
    // Add padding byte if MSB is set (to ensure positive integer)
    const needsPadding = bytes[0] >= 0x80;
    const paddedBytes = needsPadding ? new Uint8Array([0, ...bytes]) : bytes;
    const length = this.encodeLength(paddedBytes.length);
    return new Uint8Array([0x02, ...length, ...paddedBytes]); // 0x02 = INTEGER tag
  }

  /**
   * Creates proper ASN.1 DER encoding for an RSA public key. This method implements the ASN.1
   * (Abstract Syntax Notation One) DER (Distinguished Encoding Rules) format required for RSA
   * public keys. The encoding follows RFC 3447 and OWASP cryptographic standards to ensure compatibility
   * with standard crypto libraries.
   * 
   * The DER structure for RSA public keys is:
   * ```
   * RSAPublicKey ::= SEQUENCE {
   *   modulus         INTEGER,  -- n
   *   publicExponent  INTEGER   -- e
   * }
   * ```
   * 
   * Wrapped in a SubjectPublicKeyInfo structure with RSA algorithm identifier.
   * 
   * @param n - RSA modulus as ArrayBuffer (from JWK 'n' parameter)
   * @param e - RSA exponent as ArrayBuffer (from JWK 'e' parameter)
   * @returns ArrayBuffer containing the DER-encoded public key
   * 
   * @private This method is used internally by jwkToPem()
   * 
   * @example
   * ```typescript
   * // Internal usage - converts binary RSA parameters to DER format
   * const nBuffer = base64urlToArrayBuffer(jwk.n);  // RSA modulus
   * const eBuffer = base64urlToArrayBuffer(jwk.e);  // RSA exponent (usually 65537)
   * const derBytes = this.createRSAPublicKeyDER(nBuffer, eBuffer);
   * // derBytes now contains properly encoded ASN.1 DER data
   * ```
   */
  private createRSAPublicKeyDER(n: ArrayBuffer, e: ArrayBuffer): ArrayBuffer {
    const nBytes = new Uint8Array(n);
    const eBytes = new Uint8Array(e);
    
    // ASN.1 DER encoding for RSA public key
    const nInteger = this.encodeInteger(nBytes);
    const eInteger = this.encodeInteger(eBytes);
    
    // RSA public key sequence
    const sequence = new Uint8Array([...nInteger, ...eInteger]);
    const sequenceLength = this.encodeLength(sequence.length);
    const rsaSequence = new Uint8Array([0x30, ...sequenceLength, ...sequence]);
    
    // RSA algorithm identifier (1.2.840.113549.1.1.1)
    const rsaOID = new Uint8Array([
      0x30, 0x0d, // SEQUENCE
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // RSA OID
      0x05, 0x00 // NULL
    ]);
    
    // BIT STRING containing the RSA sequence
    const bitStringLength = this.encodeLength(rsaSequence.length + 1);
    const bitString = new Uint8Array([0x03, ...bitStringLength, 0x00, ...rsaSequence]);
    
    // Final SEQUENCE
    const finalSequence = new Uint8Array([...rsaOID, ...bitString]);
    const finalLength = this.encodeLength(finalSequence.length);
    
    return new Uint8Array([0x30, ...finalLength, ...finalSequence]).buffer;
  }
  
  /**
   * Encodes length field in ASN.1 DER format. ASN.1 DER uses variable-length encoding for length fields:
   * - Short form: lengths 0-127 are encoded as a single byte
   * - Long form: longer lengths use multiple bytes with the first byte indicating how many additional
   *              length bytes follow
   * 
   * This ensures efficient encoding while supporting arbitrarily large structures.
   * 
   * @param length - The length value to encode (must be non-negative)
   * @returns Uint8Array containing the DER-encoded length
   * 
   * @private This method is used internally by createRSAPublicKeyDER()
   * 
   * @example
   * ```typescript
   * // Short form examples:
   * encodeLength(42)   // [42]           - single byte for lengths < 128
   * encodeLength(127)  // [127]          - maximum short form
   * 
   * // Long form examples:
   * encodeLength(200)  // [0x81, 0xc8]   - 0x81 = "1 additional byte", 0xc8 = 200
   * encodeLength(1000) // [0x82, 0x03, 0xe8] - 0x82 = "2 additional bytes", 0x03e8 = 1000
   * ```
   */
  private encodeLength(length: number): Uint8Array {
    if (length < 0x80) {
      return new Uint8Array([length]);
    }
    
    const bytes = [];
    let temp = length;
    while (temp > 0) {
      bytes.unshift(temp & 0xff);
      temp >>= 8;
    }
    
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
  }
}

/**
 * Factory function for creating a configured JWKS client instance.
 * 
 * @param config - Configuration object specifying JWKS endpoint and cache settings
 * @returns Configured JWKSClient instance ready for key retrieval operations
 * 
 * @example
 * ```typescript
 * // Create client for Wristband JWKS endpoint
 * const client = createJwksClient({
 *   jwksUri: 'https://myapp.wristband.dev/api/v1/oauth2/jwks',
 *   cacheMaxSize: 20,
 *   cacheTtl: 3600000 // 1 hour TTL
 * });
 * 
 * // Use in JWT validator
 * const publicKey = await client.getSigningKey('kid-abc123');
 * ```
 * 
 * @internal This function is used internally by the JWT validator factory
 */
export function createJwksClient(config: JWKSClientConfig): JWKSClient {
  return new JWKSClient(config);
}
