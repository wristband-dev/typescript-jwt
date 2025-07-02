<div align="center">
  <a href="https://wristband.dev">
    <picture>
      <img src="https://assets.wristband.dev/images/email_branding_logo_v1.png" alt="Github" width="297" height="64">
    </picture>
  </a>
  <p align="center">
    Enterprise-ready auth that is secure by default, truly multi-tenant, and ungated for small businesses.
  </p>
  <p align="center">
    <b>
      <a href="https://wristband.dev">Website</a> • 
      <a href="https://docs.wristband.dev/">Documentation</a>
    </b>
  </p>
</div>

<br/>

---

<br/>

# Wristband JWT Validation SDK for Typescript

[![npm package](https://img.shields.io/badge/npm%20i-typescript--jwt-brightgreen)](https://www.npmjs.com/package/@wristband/typescript-jwt)
[![version number](https://img.shields.io/github/v/release/wristband-dev/typescript-jwt?color=green&label=version)](https://github.com/wristband-dev/typescript-jwt/releases)
[![Actions Status](https://github.com/wristband-dev/typescript-jwt/workflows/Test/badge.svg)](https://github.com/wristband-dev/typescript-jwt/actions)
[![License](https://img.shields.io/github/license/wristband-dev/typescript-jwt)](https://github.com/wristband-dev/typescript-jwt/blob/main/LICENSE.md)

This framework-agnostic Typescript SDK validates JWT access tokens issued by Wristband for user or machine authentication. It uses the Wristband JWKS endpoint to resolve signing keys and verify RS256 signatures. Validation includes issuer verification, lifetime checks, and signature validation using cached keys. Developers should use this
to protect routes and ensure that only valid, Wristband-issued access tokens can access secured APIs.

You can learn more about JWTs in Wristband in our documentation:

- [JWTs and Signing Keys](https://docs.wristband.dev/docs/json-web-tokens-jwts-and-signing-keys)

<br/>

## Requirements

This SDK is designed to work for any Typescript framework (Node.js 20+, Deno, Bun, Cloudflare Workers, etc.) and relies on native Web APIs.

<br/>

## 1) Installation

```bash
npm install @wristband/typescript-jwt
```

or

```bash
yarn add @wristband/typescript-jwt
```

or

```bash
pnpm add @wristband/typescript-jwt
```

You should see the dependency added to your package.json file:

```json
{
  "dependencies": {
    "@wristband/typescript-jwt": "^0.1.0"
  }
}
```

<br/>

## 2) Wristband Configuration

First, you'll need to make sure you have an Application in your Wristband Dashboard account. If you haven't done so yet, refer to our docs on [Creating an Application](https://docs.wristband.dev/docs/quick-start-create-a-wristband-application).

**Make sure to copy the Application Vanity Domain for next steps, which can be found in "Application Settings" for your Wristband Application.**

<br/>

## 3) SDK Configuration

First, create an instance of `WristbandJwtValidator` in your server's directory structure in any location of your choice (i.e.: `src/wristband.ts`). Then, you can export this instance and use it across your project. When creating an instance, you provide all necessary configurations for your application to correlate with how you've set it up in Wristband.

```typescript
// src/wristband.ts
// ESModules import:
import { createWristbandJwtValidator } from '@wristband/typescript-jwt';
// Or CommonJS import:
// const { createWristbandJwtValidator } = require('@wristband/typescript-jwt');

const wristbandJwtValidator = createWristbandJwtValidator({
  wristbandApplicationVanityDomain: 'auth.yourapp.io',
});

// ESModules export:
export { wristbandJwtValidator };
// Or CommonJS export:
// module.exports = { wristbandJwtValidator };
```

<br/>

## 4) Extract and Validate JWT Tokens

The SDK provides methods to extract Bearer tokens from Authorization headers and validate them. Here are examples for a few frameworks:

### Express

```typescript
// middleware.ts
import { Request, Response, NextFunction } from 'express';
import { wristbandJwtValidator } from './wristband';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = wristbandJwtValidator.extractBearerToken(req.headers.authorization);
    const result = await wristbandJwtValidator.validate(token);
    
    if (result.isValid) {
      req.user = result.payload;
      next();
    } else {
      res.status(401).json({ error: result.errorMessage });
    }
  } catch (error) {
    res.status(401).json({ error: 'Authentication required' });
  }
};


// server.ts
import express from 'express';
import { requireAuth } from './middleware';

const app = express();

// Apply to protected routes
app.get('/api/protected/data', requireAuth, (req, res) => {
  res.json({ message: 'Hello from protected API!', user: req.user });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

<br/>

### NextJS

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { wristbandJwtValidator } from './wristband';

export async function middleware(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = wristbandJwtValidator.extractBearerToken(authHeader);
    const result = await wristbandJwtValidator.validate(token);
    
    if (!result.isValid) {
      return NextResponse.json(
        { error: result.errorMessage }, 
        { status: 401 }
      );
    }
    
    // Add user info to headers for downstream API routes
    const response = NextResponse.next();
    response.headers.set('x-user-id', result.payload?.sub || '');
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Authentication required' }, 
      { status: 401 }
    );
  }
}

export const config = {
  matcher: '/api/protected/:path*'
};
```

<br/>

### Deno

```typescript
// middleware.ts
import { wristbandJwtValidator } from './wristband';

export async function requireAuth(req: Request, next: () => Promise<Response>): Promise<Response> {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = wristbandJwtValidator.extractBearerToken(authHeader);
    const result = await wristbandJwtValidator.validate(token);
    
    if (!result.isValid) {
      return new Response(JSON.stringify({ error: result.errorMessage }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Add user to request context
    (req as any).user = result.payload;
    return await next();
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


// server.ts
import { requireAuth } from './auth.ts';

const protectedHandler = requireAuth(async (req, user) => {
  return new Response(JSON.stringify({ 
    message: 'Hello from protected API!',
    user 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  if (url.pathname === '/api/protected') {
    return await protectedHandler(req);
  }
  
  return new Response('Not Found', { status: 404 });
}

Deno.serve({ port: 8000 }, handler);
```

<br/>

## JWKS Caching and Expiration

The SDK automatically retrieves and caches JSON Web Key Sets (JWKS) from your Wristband application's domain to validate incoming access tokens. By default, keys are cached in memory and reused across requests to avoid unnecessary network calls.

You can control how the SDK handles this caching behavior using two optional configuration values: `jwksCacheMaxSize` and `jwksCacheTtl`.

**Set a limit on how many keys to keep in memory:**
```typescript
const validator = createWristbandJwtValidator({
  wristbandApplicationVanityDomain: 'auth.yourapp.io',
  jwksCacheMaxSize: 10 // Keep at most 10 keys in cache
});
```

**Set a time-to-live duration for each key:**
```typescript
const validator = createWristbandJwtValidator({
  wristbandApplicationVanityDomain: 'auth.yourapp.io',
  jwksCacheTtl: 2629746000 // Expire keys from cache after 1 month (in milliseconds)
});
```

If `jwksCacheTtl` is not set, cached keys remain available until evicted by the cache size limit.

<br>

## SDK Configuration Options

| JWT Validation Option | Type | Required | Description |
| --------------------- | ---- | -------- | ----------- |
| jwksCacheMaxSize | number | No | Maximum number of JWKs to cache in memory. When exceeded, the least recently used keys are evicted. Defaults to 20. |
| jwksCacheTtl | number | No | Time-to-live for cached JWKs, in milliseconds. If not set, keys remain in cache until eviction by size limit. |
| wristbandApplicationVanityDomain | string | Yes | Yes	The Wristband vanity domain used to construct the JWKS endpoint URL for verifying tokens. Example: `myapp.wristband.dev`. |

<br/>

## API Reference

### `createWristbandJwtValidator(config)`

This is a factory function that creates a configured JWT validator instance.

**Parameters:**
| Name | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| config | `WristbandJwtValidatorConfig` | Yes | Configuration options (see [SDK Configuration Options](#sdk-configuration-options)) |

**Returns:**
- The Configured `WristbandJwtValidator` instance

**Example:**
```typescript
const validator = createWristbandJwtValidator({
  wristbandApplicationVanityDomain: 'myapp.wristband.dev',
  jwksCacheMaxSize: 20,
  jwksCacheTtl: 3600000
});
```

<br/>

### `extractBearerToken(authorizationHeader)`

This is used to extract the raw Bearer token from an HTTP Authorization header. It can handle various input formats and validates the Bearer scheme according to [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750).

The function will throw an error for the following cases:
- The Authorization header is missing
- The Authorization header is malformed
- The Authorization header contains multiple entries
- The Authorization header uses wrong scheme (i.e. not using `Bearer`)
- The Authorization header is missing the token value

**Parameters:**
| Name | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| authorizationHeader | string or string[] | Yes | The Authorization header value(s) of the current request. |

**Returns:**
| Type | Description |
| ---- | ----------- |
| string | The extracted Bearer token |


**Valid usage examples:**
```typescript
const token1 = wristbandJwtValidator.extractBearerToken('Bearer abc123');
const token2 = wristbandJwtValidator.extractBearerToken(['Bearer abc123']);
// From Express.js request
const token3 = wristbandJwtValidator.extractBearerToken(req.headers.authorization);
// From Next.js request
const token4 = wristbandJwtValidator.extractBearerToken(request.headers.get('authorization'));
```

**Invalid cases that throw errors:**
```typescript
wristbandJwtValidator.extractBearerToken(['Bearer abc', 'Bearer xyz']);
wristbandJwtValidator.extractBearerToken([]);
wristbandJwtValidator.extractBearerToken('Basic abc123');
wristbandJwtValidator.extractBearerToken('Bearer ');
```

### `validate(token)`

Validates a JWT access token issued by Wristband. Performs comprehensive validation including format checking, signature verification, issuer validation, and expiration checks.

**Parameters:**
| Name | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| token | string | Yes | The Wristband JWT token to validate. |

**Returns:**
| Type | Description |
| ---- | ----------- |
| `Promise<JwtValidationResult>` | Validation result object. |

JwtValidationResult interface:
```typescript
interface JwtValidationResult {
  isValid: boolean;
  payload?: JWTPayload;     // Present when isValid is true
  errorMessage?: string;    // Present when isValid is false
}
```

JWTPayload interface:
```typescript
interface JWTPayload {
  iss?: string;           // Issuer
  sub?: string;           // Subject (user ID)
  aud?: string | string[]; // Audience
  exp?: number;           // Expiration time (Unix timestamp)
  nbf?: number;           // Not before (Unix timestamp)
  iat?: number;           // Issued at (Unix timestamp)
  jti?: string;           // JWT ID
  [key: string]: any;     // Any additional Wristband/custom claims
}
```

**Valid usage examples:**
```typescript
const result = await validator.validate(token);

if (result.isValid) {
  console.log('User ID:', result.payload?.sub);
  console.log('Expires at:', new Date(result.payload?.exp! * 1000));
} else {
  console.error('Validation failed:', result.errorMessage);
}
```

<br/>

## Questions

Reach out to the Wristband team at <support@wristband.dev> for any questions regarding this SDK.

<br/>
