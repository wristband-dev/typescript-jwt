// ////////////////////////////////////
//  EXTERNAL TYPES
// ////////////////////////////////////

/**
 * Interface for validating and extracting Bearer tokens from JWTs issued by Wristband. This is the main entry
 * point for verifying token authenticity, issuer, expiration, and signature against the Wristband JWKS endpoint.
 */
export interface WristbandJwtValidator {
  /**
   * Extracts the raw Bearer token from an HTTP Authorization header.
   *
   * @param authorizationHeader - The value of the Authorization header, which may be:
   *   - A string (e.g., "Bearer abc123")
   *   - An array containing a single string
   *   - `null` or `undefined`
   * @returns The raw token string (e.g., "abc123") if valid
   * @throws If the header is missing, malformed, contains multiple entries, or uses a non-Bearer scheme
   */
  extractBearerToken(authorizationHeader?: string | string[] | null): string;

  /**
   * Validates a JWT token using the Wristband JWKS endpoint and RS256 signature.
   * 
   * Performs checks for:
   * - Proper JWT structure
   * - Supported algorithm (RS256)
   * - Valid signature
   * - Matching issuer
   * - Expiration (`exp`) and not-before (`nbf`) claims
   *
   * @param token - A raw JWT token string
   * @returns A `JwtValidationResult` object indicating success or failure with details
   */
  validate(token: string): Promise<JwtValidationResult>;
}

/**
 * Provides configuration options for Wristband JWT validation.
 */
export interface WristbandJwtValidatorConfig {
  /**
   * The Wristband application vanity domain. This value is used to construct the JWKS endpoint
   * URL for token validation.
   */
  wristbandApplicationVanityDomain: string;

  /**
   * The maximum number of JWK keys to cache. When this limit is reached, the least recently
   * used keys will be evicted from the cache. Default is 20.
   */
  jwksCacheMaxSize?: number;

  /**
   * The time-to-live for cached JWK keys, in milliseconds. If undefined (the default), keys are cached
   * indefinitely until evicted due to the cache size limit.
   */
  jwksCacheTtl?: number;
}

/**
 * Standard JWT payload structure containing common claims and custom properties. Follows RFC 7519
 * specifications for JSON Web Token claims.
 */
export interface JWTPayload {
  /**
   * Issuer claim - identifies the principal that issued the JWT.
   */
  iss?: string;
  
  /**
   * Subject claim - identifies the principal that is the subject of the JWT.
   */
  sub?: string;
  
  /**
   * Audience claim - identifies the recipients that the JWT is intended for.
   */
  aud?: string | string[];
  
  /**
   * Expiration time claim - identifies the expiration time on or after which the JWT must not be accepted for
   * processing (Unix timestamp).
   */
  exp?: number;
  
  /**
   * Not before claim - identifies the time before which the JWT must not be accepted for processing (Unix timestamp).
   */
  nbf?: number;
  
  /**
   * Issued at claim - identifies the time at which the JWT was issued (Unix timestamp).
   */
  iat?: number;
  
  /**
   * JWT ID claim - provides a unique identifier for the JWT.
   */
  jti?: string;
  
  /**
   * Any other additional claims included in the payload.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Result object returned by JWT validation. Contains validation status, decoded payload on success, or
 * error details on failure.
 */
export interface JwtValidationResult {
  /**
   * Flag indicating whether the token is valid or not.
   */
  isValid: boolean;
  
  /**
   * Decoded JWT payload, if valid.
   */
  payload?: JWTPayload;
  
  /**
   * Error message, if validation failed.
   */
  errorMessage?: string;
}

// ////////////////////////////////////
//  INTERNAL TYPES
// ////////////////////////////////////

/**
 * Configuration options for the JWKS (JSON Web Key Set) client.
 */
export interface JWKSClientConfig {
  /**
   * The URI endpoint for fetching the JSON Web Key Set.
   */
  jwksUri: string;
  
  /**
   * Maximum number of keys to store in the cache.
   */
  cacheMaxSize?: number;
  
  /**
   * Time-to-live for cached keys, in milliseconds. If undefined, keys are cached indefinitely until evicted.
   */
  cacheTtl?: number;
}

/**
 * Represents a single JSON Web Key (JWK) as defined in RFC 7517. Contains the cryptographic key material and metadata
 * needed for JWT signature verification.
 */
export interface JWKSKey {
  /**
   * Key type parameter - identifies the cryptographic algorithm family used with the key.
   */
  kty: string;
  
  /**
   * Key ID parameter - used to match a specific key during signature verification.
   */
  kid: string;
  
  /**
   * Public key use parameter - identifies the intended use of the public key.
   */
  use?: string;
  
  /**
   * RSA modulus parameter - represents the modulus value for RSA public keys (base64url-encoded).
   */
  n?: string;
  
  /**
   * RSA exponent parameter - represents the exponent value for RSA public keys (base64url-encoded).
   */
  e?: string;
  
  /**
   * X.509 certificate chain parameter - contains the X.509 public key certificate or certificate chain.
   */
  x5c?: string[];
  
  /**
   * X.509 certificate SHA-1 thumbprint parameter - base64url-encoded SHA-1 thumbprint of the X.509 certificate.
   */
  x5t?: string;
  
  /**
   * Algorithm parameter - identifies the algorithm intended for use with the key.
   */
  alg?: string;
}

/**
 * Response structure from the JWKS endpoint. Contains an array of JWK keys used for JWT signature verification.
 */
export interface JWKSResponse {
  /**
   * Array of JSON Web Keys available for signature verification.
   */
  keys: JWKSKey[];
}

/**
 * JWT header structure containing algorithm and type information. Represents the header portion of a JSON Web Token as
 * defined in RFC 7519.
 */
export interface JWTHeader {
  /**
   * Algorithm parameter - identifies the cryptographic algorithm used to secure the JWT.
   * For Wristband tokens, this should be "RS256".
   */
  alg: string;
  
  /**
   * Type parameter - declares the media type of the JWT.
   */
  typ: string;
  
  /**
   * Key ID parameter - hints about which key was used to secure the JWT. Used to match against the corresponding JWK
   * during verification.
   */
  kid: string;
}

/**
 * Configuration options for the LRU cache instance.
 */
export interface CacheOptions {
  /**
   * Maximum number of entries to store in the cache. When this limit is exceeded, the least
   * recently used entry will be evicted. Must be a positive integer.
   */
  maxSize: number;
  /**
   * Optional time-to-live for cache entries, in milliseconds. If specified, entries will be
   * automatically considered expired and removed after this duration, regardless of access
   * patterns. If undefined, entries will only be evicted due to size constraints.
   */
  ttl?: number;
}

/**
 * Internal structure representing a cached entry with metadata. Contains the cached value along with
 * timing information needed for LRU eviction decisions and TTL expiration checking.
 */
export interface CacheEntry {
  /**
   * The cached string value.
   */
  value: string;
  /**
   * Timestamp of when this entry was last accessed (Unix milliseconds).
   * Updated on every get() operation to maintain accurate LRU ordering.
   */
  lastAccessed: number;
  /**
   * Timestamp of when this entry was created or last updated (Unix milliseconds).
   * Used for TTL expiration calculations.
   */
  created: number;
}
