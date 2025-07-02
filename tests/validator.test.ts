import { createWristbandJwtValidator, WristbandJwtValidatorImpl } from '../src/validator';
import { JWKSClient } from '../src/jwks-client';
import * as crypto from '../src/utils/crypto';
import * as jwksClient from '../src/jwks-client';

describe('WristbandJwtValidatorImpl', () => {
  const validIssuer = 'https://test.wristband.dev';
  let validator: WristbandJwtValidatorImpl;
  let mockJwksClient: jest.Mocked<JWKSClient>;
  let mockBase64urlDecode: jest.SpyInstance;
  let mockValidateAlgorithm: jest.SpyInstance;
  let mockVerifyRS256Signature: jest.SpyInstance;

  beforeEach(() => {
    // Create mock JWKS client
    mockJwksClient = {
      getSigningKey: jest.fn(),
      clear: jest.fn(),
      getCacheStats: jest.fn(),
    } as unknown as jest.Mocked<JWKSClient>;

    // Spy on crypto functions
    mockBase64urlDecode = jest.spyOn(crypto, 'base64urlDecode');
    mockValidateAlgorithm = jest.spyOn(crypto, 'validateAlgorithm');
    mockVerifyRS256Signature = jest.spyOn(crypto, 'verifyRS256Signature');

    validator = new WristbandJwtValidatorImpl(mockJwksClient, validIssuer);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create validator with valid parameters', () => {
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, validIssuer)).not.toThrow();
    });

    it('should throw error when jwksClient is null', () => {
      expect(() => new WristbandJwtValidatorImpl(null as any, validIssuer))
        .toThrow('JWKSClient must be provided to the validator.');
    });

    it('should throw error when issuer is empty', () => {
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, ''))
        .toThrow('A valid issuer must be provided to the validator.');
    });

    it('should throw error when issuer is whitespace only', () => {
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, '   '))
        .toThrow('A valid issuer must be provided to the validator.');
    });

    it('should accept RS256 algorithm', () => {
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, validIssuer, ['RS256']))
        .not.toThrow();
    });

    it('should throw error for single non-RS256 algorithm', () => {
      // Now with OR logic, single non-RS256 algorithms should throw
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, validIssuer, ['HS256']))
        .toThrow('Only the RS256 algorithm is supported.');
    });

    it('should throw error for multiple algorithms with wrong algorithm', () => {
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, validIssuer, ['HS256', 'ES256']))
        .toThrow('Only the RS256 algorithm is supported.');
    });

    it('should throw error for empty algorithms array', () => {
      expect(() => new WristbandJwtValidatorImpl(mockJwksClient, validIssuer, []))
        .toThrow('Only the RS256 algorithm is supported.');
    });
  });

  describe('extractBearerToken', () => {
    describe('Valid cases', () => {
      it('should extract token from valid Bearer header string', () => {
        const result = validator.extractBearerToken('Bearer abc123');
        expect(result).toBe('abc123');
      });

      it('should extract token from valid Bearer header array', () => {
        const result = validator.extractBearerToken(['Bearer abc123']);
        expect(result).toBe('abc123');
      });

      it('should handle Bearer header with complex token', () => {
        const complexToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
        const result = validator.extractBearerToken(`Bearer ${complexToken}`);
        expect(result).toBe(complexToken);
      });
    });

    describe('Invalid cases - null/undefined', () => {
      it('should throw error for null header', () => {
        expect(() => validator.extractBearerToken(null))
          .toThrow('No authorization header provided');
      });

      it('should throw error for undefined header', () => {
        expect(() => validator.extractBearerToken(undefined))
          .toThrow('No authorization header provided');
      });
    });

    describe('Invalid cases - arrays', () => {
      it('should throw error for empty array', () => {
        expect(() => validator.extractBearerToken([]))
          .toThrow('No authorization header provided');
      });

      it('should throw error for multiple headers', () => {
        expect(() => validator.extractBearerToken(['Bearer abc', 'Bearer xyz']))
          .toThrow('Multiple authorization headers not allowed');
      });

      it('should throw error for empty string in array', () => {
        expect(() => validator.extractBearerToken(['']))
          .toThrow('No authorization header provided');
      });

      it('should throw error for whitespace-only string in array', () => {
        expect(() => validator.extractBearerToken(['   ']))
          .toThrow('No authorization header provided');
      });
    });

    describe('Invalid cases - wrong scheme', () => {
      it('should throw error for Basic auth scheme', () => {
        expect(() => validator.extractBearerToken('Basic abc123'))
          .toThrow('Authorization header must provide "Bearer" token');
      });

      it('should throw error for no auth scheme', () => {
        expect(() => validator.extractBearerToken('abc123'))
          .toThrow('Authorization header must provide "Bearer" token');
      });

      it('should throw error for case-sensitive Bearer', () => {
        expect(() => validator.extractBearerToken('bearer abc123'))
          .toThrow('Authorization header must provide "Bearer" token');
      });
    });

    describe('Invalid cases - missing token', () => {
      it('should throw error for Bearer without token', () => {
        expect(() => validator.extractBearerToken('Bearer '))
          .toThrow('No token provided');
      });

      it('should throw error for Bearer only', () => {
        expect(() => validator.extractBearerToken('Bearer'))
          .toThrow('Authorization header must provide "Bearer" token');
      });
    });
  });

  describe('validate', () => {
    const validHeader = { alg: 'RS256', kid: 'test-key-id' };
    const validPayload = {
      iss: validIssuer,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      sub: 'user123'
    };

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset all mocks to default behavior for each test
      mockBase64urlDecode.mockRestore();
      mockValidateAlgorithm.mockRestore();
      mockVerifyRS256Signature.mockRestore();
      
      // Re-create spies
      mockBase64urlDecode = jest.spyOn(crypto, 'base64urlDecode');
      mockValidateAlgorithm = jest.spyOn(crypto, 'validateAlgorithm');
      mockVerifyRS256Signature = jest.spyOn(crypto, 'verifyRS256Signature');
      
      // Set up default successful mocks
      mockBase64urlDecode
        .mockReturnValueOnce(JSON.stringify(validHeader))
        .mockReturnValueOnce(JSON.stringify(validPayload));
      mockValidateAlgorithm.mockReturnValue(true);
      mockVerifyRS256Signature.mockResolvedValue(true);
      mockJwksClient.getSigningKey.mockResolvedValue('mock-public-key');
    });

    describe('Basic validation', () => {
      it('should return invalid for null token', async () => {
        const result = await validator.validate(null as any);
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'No token provided'
        });
      });

      it('should return invalid for empty token', async () => {
        const result = await validator.validate('');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'No token provided'
        });
      });

      it('should return invalid for malformed JWT (wrong number of parts)', async () => {
        const result = await validator.validate('invalid.jwt');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Invalid JWT format'
        });
      });

      it('should return invalid for JWT with too many parts', async () => {
        const result = await validator.validate('part1.part2.part3.part4');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Invalid JWT format'
        });
      });
    });

    describe('Decoding errors', () => {
      it('should return invalid for JWT with invalid base64 encoding', async () => {
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode.mockImplementation(() => {
          throw new Error('Invalid base64');
        });

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Invalid JWT encoding'
        });
      });

      it('should return invalid for JWT with invalid JSON in header', async () => {
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce('invalid-json')
          .mockReturnValueOnce(JSON.stringify(validPayload));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Invalid JWT encoding'
        });
      });
    });

    describe('Algorithm validation', () => {
      it('should return invalid for unsupported algorithm', async () => {
        const headerWithBadAlg = { ...validHeader, alg: 'HS256' };
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce(JSON.stringify(headerWithBadAlg))
          .mockReturnValueOnce(JSON.stringify(validPayload));
        mockValidateAlgorithm.mockReturnValue(false);

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Algorithm HS256 not allowed. Expected one of: RS256'
        });
      });

      it('should accept RS256 algorithm during validation', async () => {
        // This tests the actual validateAlgorithm function behavior
        const result = await validator.validate('header.payload.signature');
        expect(result.isValid).toBe(true);
        expect(mockValidateAlgorithm).toHaveBeenCalledWith('RS256', ['RS256']);
      });
    });

    describe('Issuer validation', () => {
      it('should return invalid for wrong issuer', async () => {
        const payloadWithBadIssuer = { ...validPayload, iss: 'https://wrong-issuer.com' };
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce(JSON.stringify(validHeader))
          .mockReturnValueOnce(JSON.stringify(payloadWithBadIssuer));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: `Invalid issuer. Expected ${validIssuer}, got https://wrong-issuer.com`
        });
      });
    });

    describe('Time-based validation', () => {
      it('should return invalid for expired token', async () => {
        const expiredPayload = { 
          ...validPayload, 
          exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        };
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce(JSON.stringify(validHeader))
          .mockReturnValueOnce(JSON.stringify(expiredPayload));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Token has expired'
        });
      });

      it('should return invalid for token not yet valid (nbf)', async () => {
        const futurePayload = { 
          ...validPayload, 
          nbf: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce(JSON.stringify(validHeader))
          .mockReturnValueOnce(JSON.stringify(futurePayload));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Token not yet valid'
        });
      });

      it('should pass validation for token without exp claim', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { exp, ...payloadWithoutExp } = validPayload;
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce(JSON.stringify(validHeader))
          .mockReturnValueOnce(JSON.stringify(payloadWithoutExp));

        const result = await validator.validate('header.payload.signature');
        expect(result.isValid).toBe(true);
      });
    });

    describe('Key ID validation', () => {
      it('should return invalid for missing kid in header', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { kid, ...headerWithoutKid } = validHeader;
        mockBase64urlDecode.mockReset();
        mockBase64urlDecode
          .mockReturnValueOnce(JSON.stringify(headerWithoutKid))
          .mockReturnValueOnce(JSON.stringify(validPayload));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Token header missing kid (key ID)'
        });
      });
    });

    describe('JWKS client errors', () => {
      it('should return invalid when JWKS client throws error', async () => {
        mockJwksClient.getSigningKey.mockRejectedValue(new Error('JWKS fetch failed'));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Failed to get signing key: JWKS fetch failed'
        });
      });

      it('should handle non-Error objects from JWKS client', async () => {
        mockJwksClient.getSigningKey.mockRejectedValue('string error');

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Failed to get signing key: Unknown error'
        });
      });
    });

    describe('Signature validation', () => {
      it('should return invalid for invalid signature', async () => {
        mockVerifyRS256Signature.mockResolvedValue(false);

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Invalid signature'
        });
      });
    });

    describe('Successful validation', () => {
      it('should return valid result for completely valid token', async () => {
        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: true,
          payload: validPayload
        });
      });

      it('should call crypto functions with correct parameters', async () => {
        await validator.validate('header.payload.signature');
        
        expect(mockValidateAlgorithm).toHaveBeenCalledWith('RS256', ['RS256']);
        expect(mockJwksClient.getSigningKey).toHaveBeenCalledWith('test-key-id');
        expect(mockVerifyRS256Signature).toHaveBeenCalledWith(
          'header.payload',
          'signature',
          'mock-public-key'
        );
      });
    });

    describe('Unexpected errors', () => {
      it('should handle unexpected errors gracefully', async () => {
        // Throw error during signature verification to hit the outer catch block
        mockVerifyRS256Signature.mockReset();
        mockVerifyRS256Signature.mockRejectedValue(new Error('Unexpected error'));

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Unexpected error'
        });
      });

      it('should handle non-Error objects in catch block', async () => {
        // Throw non-Error object during signature verification
        mockVerifyRS256Signature.mockReset();
        mockVerifyRS256Signature.mockRejectedValue('string error');

        const result = await validator.validate('header.payload.signature');
        expect(result).toEqual({
          isValid: false,
          errorMessage: 'Token validation failed'
        });
      });
    });
  });
});

describe('createWristbandJwtValidator', () => {
  let mockJwksClient: jest.Mocked<JWKSClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock JWKS client
    mockJwksClient = {
      getSigningKey: jest.fn(),
      clear: jest.fn(),
      getCacheStats: jest.fn(),
    } as unknown as jest.Mocked<JWKSClient>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create validator with correct configuration', () => {
    const mockCreateJwksClient = jest.spyOn(jwksClient, 'createJwksClient')
      .mockReturnValue(mockJwksClient);

    const config = {
      wristbandApplicationVanityDomain: 'test.wristband.dev',
      jwksCacheMaxSize: 15,
      jwksCacheTtl: 3600000
    };

    const validator = createWristbandJwtValidator(config);
    expect(validator).toBeInstanceOf(WristbandJwtValidatorImpl);
    expect(mockCreateJwksClient).toHaveBeenCalledWith({
      jwksUri: 'https://test.wristband.dev/api/v1/oauth2/jwks',
      cacheMaxSize: 15,
      cacheTtl: 3600000
    });
  });

  it('should use default cache size when not provided', () => {
    const mockCreateJwksClient = jest.spyOn(jwksClient, 'createJwksClient')
      .mockReturnValue(mockJwksClient);

    const config = {
      wristbandApplicationVanityDomain: 'test.wristband.dev'
    };

    const validator = createWristbandJwtValidator(config);
    expect(validator).toBeInstanceOf(WristbandJwtValidatorImpl);
    expect(mockCreateJwksClient).toHaveBeenCalledWith({
      jwksUri: 'https://test.wristband.dev/api/v1/oauth2/jwks',
      cacheMaxSize: 20, // default value
      cacheTtl: undefined
    });
  });

  it('should construct proper issuer URL', () => {
    const mockCreateJwksClient = jest.spyOn(jwksClient, 'createJwksClient')
      .mockReturnValue(mockJwksClient);

    const config = {
      wristbandApplicationVanityDomain: 'myapp.wristband.dev',
      jwksCacheMaxSize: 10
    };

    const validator = createWristbandJwtValidator(config);
    expect(validator).toBeInstanceOf(WristbandJwtValidatorImpl);
    expect(mockCreateJwksClient).toHaveBeenCalledWith({
      jwksUri: 'https://myapp.wristband.dev/api/v1/oauth2/jwks',
      cacheMaxSize: 10,
      cacheTtl: undefined
    });
  });

  it('should pass undefined cacheTtl when not provided', () => {
    const mockCreateJwksClient = jest.spyOn(jwksClient, 'createJwksClient')
      .mockReturnValue(mockJwksClient);

    const config = {
      wristbandApplicationVanityDomain: 'test.wristband.dev',
      jwksCacheMaxSize: 5
    };

    const validator = createWristbandJwtValidator(config);
    expect(validator).toBeInstanceOf(WristbandJwtValidatorImpl);
    expect(mockCreateJwksClient).toHaveBeenCalledWith({
      jwksUri: 'https://test.wristband.dev/api/v1/oauth2/jwks',
      cacheMaxSize: 5,
      cacheTtl: undefined // should be undefined when not set (cached indefinitely)
    });
  });
});
