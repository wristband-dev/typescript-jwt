import {
  JWTHeader,
  JWTPayload,
  JwtValidationResult,
  WristbandJwtValidator,
  WristbandJwtValidatorConfig,
} from './types';
import { base64urlDecode, validateAlgorithm, verifyRS256Signature } from './utils/crypto';
import { createJwksClient, JWKSClient } from './jwks-client';

/**
 * Concrete implementation of the WristbandJwtValidator interface that provides JWT validation capabilities,
 * including Bearer token extraction, signature verification using JWKS, and comprehensive claim validation
 * following OWASP security recommendations.
 * 
 * @internal This class is not intended for direct instantiation by consumers.
 * Use the `createWristbandJwtValidator` factory function instead.
 */
export class WristbandJwtValidatorImpl implements WristbandJwtValidator {
  /**
   * JWKS client instance for fetching and caching signing keys.
   */
  private jwksClient: JWKSClient;
  /**
   * Expected issuer claim value constructed from the Wristband application vanity domain.
   */
  private issuer: string;
  /**
   * List of allowed signing algorithms for security validation. Defaults to ['RS256'].
   */
  private algorithms: string[];

  /**
   * Creates a new WristbandJwtValidatorImpl instance.
   * 
   * @param jwksClient - Configured JWKS client for key retrieval
   * @param issuer - Expected issuer URL for token validation
   * @param algorithms - Allowed signing algorithms (defaults to ['RS256'])
   */
  constructor(jwksClient: JWKSClient, issuer: string, algorithms: string[] = ['RS256']) {
    if (!jwksClient) {
      throw new Error('JWKSClient must be provided to the validator.');
    }
    if (!issuer?.trim()) {
      throw new Error('A valid issuer must be provided to the validator.');
    }
    if (
      !algorithms ||
      algorithms.length !== 1 ||
      typeof algorithms[0] !== 'string' ||
      algorithms[0].toUpperCase() !== 'RS256'
    ) {
      throw new Error('Only the RS256 algorithm is supported.');
    }

    this.jwksClient = jwksClient;
    this.issuer = issuer;
    this.algorithms = algorithms;
  }

  /**
   * Extracts the raw Bearer token from an HTTP Authorization header. Handles various input formats and
   * validates the Bearer scheme according to RFC 6750.
   * 
   * Valid cases:
   * - `extractBearerToken('Bearer abc123')`
   * - `extractBearerToken(['Bearer abc123'])`
   * 
   * Invalid cases:
   * - `extractBearerToken(['Bearer abc', 'Bearer xyz'])` - Multiple headers
   * - `extractBearerToken([])` - Empty array
   * - `extractBearerToken([''])` - Empty string in array
   * - `extractBearerToken(['Basic abc123'])` - Wrong auth scheme
   * 
   * @param authorizationHeader - The Authorization header value(s)
   * @returns The extracted Bearer token string
   * @throws {Error} When header is missing, malformed, contains multiple entries, or uses wrong scheme
   */
  extractBearerToken(authorizationHeader?: string | string[] | null): string {  
    // Handle null/undefined
    if (!authorizationHeader) {
      throw new Error('No authorization header provided');
    }
    
    let headerValue: string;
    
    // Handle array
    if (Array.isArray(authorizationHeader)) {
      if (authorizationHeader.length === 0) {
        throw new Error('No authorization header provided');
      }
      if (authorizationHeader.length > 1) {
        throw new Error('Multiple authorization headers not allowed');
      }
      headerValue = authorizationHeader[0];
    } else {
      headerValue = authorizationHeader;
    }
    
    // Handle empty string
    if (!headerValue?.trim()) {
      throw new Error('No authorization header provided');
    }
    
    if (!headerValue.startsWith('Bearer ')) {
      throw new Error('Authorization header must provide "Bearer" token');
    }
    
    const token = headerValue.substring(7);
    if (!token) {
      throw new Error('No token provided');
    }
    
    return token;
  }

  /**
   * Validate a JWT token
   */
  async validate(token: string): Promise<JwtValidationResult> {
    try {
      if (!token) {
        return { isValid: false, errorMessage: 'No token provided' };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return { isValid: false, errorMessage: 'Invalid JWT format' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;
      
      // Decode header and payload
      let header: JWTHeader;
      let payload: JWTPayload;
      
      try {
        header = JSON.parse(base64urlDecode(headerB64)) as JWTHeader;
        payload = JSON.parse(base64urlDecode(payloadB64)) as JWTPayload;
      } catch (error) {
        return { isValid: false, errorMessage: 'Invalid JWT encoding' };
      }

      // Validate algorithm using OWASP-recommended practices
      if (!validateAlgorithm(header.alg, this.algorithms)) {
        return { 
          isValid: false, 
          errorMessage: `Algorithm ${header.alg} not allowed. Expected one of: ${this.algorithms.join(', ')}` 
        };
      }

      // Validate issuer
      if (payload.iss !== this.issuer) {
        return { 
          isValid: false, 
          errorMessage: `Invalid issuer. Expected ${this.issuer}, got ${payload.iss}` 
        };
      }

      // Validate expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return { isValid: false, errorMessage: 'Token has expired' };
      }

      // Validate not before
      if (payload.nbf && Date.now() < payload.nbf * 1000) {
        return { isValid: false, errorMessage: 'Token not yet valid' };
      }

      // Get signing key and verify signature
      if (!header.kid) {
        return { isValid: false, errorMessage: 'Token header missing kid (key ID)' };
      }

      let publicKey: string;
      try {
        publicKey = await this.jwksClient.getSigningKey(header.kid);
      } catch (error) {
        return { 
          isValid: false, 
          errorMessage: `Failed to get signing key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }

      // Verify signature using OWASP-compliant crypto
      const signatureValid = await verifyRS256Signature(`${headerB64}.${payloadB64}`, signatureB64, publicKey);
      if (!signatureValid) {
        return { isValid: false, errorMessage: 'Invalid signature' };
      }

      // Validation Success
      return { isValid: true, payload };
    } catch (error) {
      return {  isValid: false,  errorMessage: error instanceof Error ? error.message : 'Token validation failed' };
    }
  }
}

/**
 * Factory function for creating a configured Wristband JWT validator instance.
 * 
 * The created validator is thread-safe and should be reused across requests to
 * benefit from JWKS key caching and connection pooling.
 * 
 * @param config - Configuration object containing Wristband domain and cache settings
 * @returns Configured WristbandJwtValidator instance ready for token validation
 * 
 * @example
 * ```typescript
 * import { createWristbandJwtValidator } from '@wristband/jwt-validation';
 * 
 * // Create validator instance (reuse across requests)
 * const validator = createWristbandJwtValidator({
 *   wristbandApplicationVanityDomain: 'myapp.wristband.dev',
 * });
 * 
 * // Express.js route handler example usage
 * app.get('/protected', async (req, res) => {
 *   try {
 *     const token = validator.extractBearerToken(req.headers.authorization);
 *     const result = await validator.validate(token);
 *     
 *     if (result.isValid) {
 *       res.json({ user: result.payload?.sub, message: 'Access granted' });
 *     } else {
 *       res.status(401).json({ error: result.errorMessage });
 *     }
 *   } catch (error) {
 *     res.status(401).json({ error: 'Authentication required' });
 *   }
 * });
 * ```
 */
export function createWristbandJwtValidator(config: WristbandJwtValidatorConfig): WristbandJwtValidator {
  const issuer = `https://${config.wristbandApplicationVanityDomain}`;
  const jwksClient = createJwksClient({
    jwksUri: `${issuer}/api/v1/oauth2/jwks`,
    cacheMaxSize: config.jwksCacheMaxSize ?? 20,
    cacheTtl: config.jwksCacheTtl, // undefined if not set (cached indefinitely)
  });
  return new WristbandJwtValidatorImpl(jwksClient, issuer, ['RS256']);
}
