/**
 * Crypto utility functions for JWT validation using Web Standards APIs.
 * 
 * This module provides framework-agnostic cryptographic utilities for JWT token validation
 * using the Web Crypto API and standard JavaScript APIs. Compatible with Node.js 20+,
 * Deno, Bun, Cloudflare Workers, and modern browsers.
 * 
 * All functions follow OWASP security recommendations and use only secure, standardized
 * cryptographic primitives to prevent common JWT vulnerabilities.
 * 
 * @module crypto
 * @requires Node.js 20+, Deno, Bun, or Cloudflare Workers
 * @compatibility
 * - Node.js 20+ (Express.js, Next.js API routes)
 * - Deno (native Web API support)
 * - Bun (native Web API support) 
 * - Edge Runtime (Next.js middleware, Cloudflare Workers, Vercel Edge Functions)
 * - Modern browsers (for client-side validation scenarios)
 */
import { pemFooter, pemHeader } from '../constants';

/**
 * Decodes a base64url-encoded string to a regular UTF-8 string.
 * 
 * Base64url encoding is used in JWTs as it's URL-safe (no padding, uses - and _ instead of + and /).
 * This function converts base64url back to standard base64 by adding padding and replacing
 * URL-safe characters, then decodes using the standard atob function. We use atob() to
 * preserve framework-agnostic functionality.
 * 
 * @param str - The base64url-encoded string to decode
 * @returns The decoded UTF-8 string
 * 
 * @example
 * ```typescript
 * const encoded = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9";
 * const decoded = base64urlDecode(encoded);
 * console.log(decoded); // '{"alg":"RS256","typ":"JWT"}'
 * ```
 * 
 * @throws {DOMException} If the input contains invalid base64 characters
 */
export function base64urlDecode(str: string): string {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
  return atob(base64);
}

/**
 * Converts a base64url-encoded string directly to a Uint8Array.
 * 
 * This is more efficient than decoding to string first when the end goal
 * is binary data for cryptographic operations. Used primarily for converting
 * JWT signatures from base64url format to Uint8Array for Web Crypto API verification.
 * We use atob() to preserve framework-agnostic functionality.
 * 
 * @param base64url - The base64url-encoded string to convert
 * @returns Uint8Array containing the decoded binary data
 * 
 * @example
 * ```typescript
 * const signature = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
 * const signatureBuffer = base64urlToArrayBuffer(signature);
 * // Use signatureBuffer with crypto.subtle.verify()
 * ```
 * 
 * @throws {DOMException} If the input contains invalid base64 characters
 */
export function base64urlToArrayBuffer(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  
  return view;
}

/**
 * Converts an ArrayBuffer or Uint8Array to a base64-encoded string.
 * 
 * Utility function for converting binary data from cryptographic operations
 * back to base64 format. Primarily used for debugging or when binary data
 * needs to be transmitted as text. We use btoa() to preserve
 * framework-agnostic functionality.
 * 
 * @param buffer - The ArrayBuffer or Uint8Array containing binary data to encode
 * @returns Base64-encoded string representation of the buffer contents
 * 
 * @example
 * ```typescript
 * const buffer = new TextEncoder().encode("Hello World");
 * const base64 = arrayBufferToBase64(buffer);
 * console.log(base64); // "SGVsbG8gV29ybGQ="
 * 
 * // Also works with ArrayBuffer
 * const arrayBuf = new Uint8Array([72, 101, 108, 108, 111]).buffer;
 * const base64 = arrayBufferToBase64(arrayBuf);
 * ```
 */
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Verifies an RS256 JWT signature using the Web Crypto API.
 * 
 * Implements OWASP-compliant JWT signature verification using RSASSA-PKCS1-v1_5 
 * with SHA-256.
 * 
 * Security features:
 * - Uses Web Crypto API for constant-time operations
 * - Validates input parameters to prevent timing attacks
 * - Implements OWASP-recommended RSASSA-PKCS1-v1_5 + SHA-256
 * - Graceful error handling without information leakage
 * 
 * @param data - The JWT header and payload joined with a dot (e.g., "header.payload")
 * @param signature - The base64url-encoded signature to verify
 * @param publicKeyPem - The RSA public key in PEM format for verification
 * @returns Promise resolving to true if signature is valid, false otherwise
 * 
 * @example
 * ```typescript
 * const headerPayload = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
 * const signature = "EkN-DOsnsuRjRO6BxXemmJDm3HbxrbRzXglbN2S4sOkopdU4IsDxTI8jO19W_A4K8ZPJijNLis4EZsHeY559a4DFOd50_OqgHs
 * 3EpI";
 * const publicKey = "-----BEGIN PUBLIC KEY-----\n...";
 * 
 * const isValid = await verifyRS256Signature(headerPayload, signature, publicKey);
 * if (isValid) {
 *   console.log("Signature verified successfully");
 * } else {
 *   console.log("Invalid signature");
 * }
 * ```
 */
export async function verifyRS256Signature(data: string, signature: string, publicKeyPem: string): Promise<boolean> {
  try {
    if (!data || !signature || !publicKeyPem) {
      return false;
    }

    // Ensure we're in an environment that supports Web Crypto API
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return false;
    }

    // Convert base64url signature to ArrayBuffer
    const signatureBuffer = base64urlToArrayBuffer(signature);
    
    // Convert data string to ArrayBuffer
    const dataBuffer = new TextEncoder().encode(data);
    
    // Parse PEM public key
    const publicKey = await importRSAPublicKey(publicKeyPem);
    
    // Verify signature using Web Crypto API with RS256 (RSASSA-PKCS1-v1_5 + SHA-256)
    const isValid = await crypto.subtle.verify(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256', // OWASP-approved hashing algorithm
      },
      publicKey,
      signatureBuffer,
      dataBuffer
    );

    return isValid;
  } catch (error) {
    return false;
  }
}

/**
 * Imports an RSA public key from PEM format using the Web Crypto API.
 * 
 * Converts a PEM-encoded RSA public key into a CryptoKey object suitable for
 * use with Web Crypto API operations. Implements secure key handling practices
 * recommended by OWASP including non-extractable key storage and restricted usage.
 * 
 * The function expects standard PEM format with proper headers and base64-encoded
 * DER data. It performs validation to ensure the key is properly formatted before
 * attempting import operations.
 * 
 * @param pemKey - RSA public key in PEM format with proper headers
 * @returns Promise resolving to a CryptoKey configured for RS256 verification
 * 
 * @example
 * ```typescript
 * const pemKey = `-----BEGIN PUBLIC KEY-----
 * MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4f5wg5l2hKsTeNem/V41
 * fGnJm6gOdrj8ym3rFkEjWT2btf02uSxZ8gktFfT0CvQKOGaKN8JW2P1MvcKZJdFC
 * ...
 * -----END PUBLIC KEY-----`;
 * 
 * try {
 *   const cryptoKey = await importRSAPublicKey(pemKey);
 *   // Use cryptoKey with crypto.subtle.verify()
 * } catch (error) {
 *   console.error('Failed to import key:', error.message);
 * }
 * ```
 * 
 * @throws {Error} If PEM format is invalid, missing headers, or key import fails
 * 
 * @internal This function is used internally by verifyRS256Signature
 */
async function importRSAPublicKey(pemKey: string): Promise<CryptoKey> {
  try {
    // Remove PEM header/footer and whitespace    
    if (!pemKey.includes(pemHeader) || !pemKey.includes(pemFooter)) {
      throw new Error('Invalid PEM format - missing headers');
    }
    
    const pemContents = pemKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');
    
    // Convert base64 to ArrayBuffer
    const binaryDer = atob(pemContents);
    const derBuffer = new ArrayBuffer(binaryDer.length);
    const derView = new Uint8Array(derBuffer);
    
    for (let i = 0; i < binaryDer.length; i++) {
      derView[i] = binaryDer.charCodeAt(i);
    }
    
    // Import key using Web Crypto API with OWASP-recommended parameters
    const publicKey = await crypto.subtle.importKey(
      'spki', // SubjectPublicKeyInfo format
      derView,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256', // OWASP-approved hash function
      },
      false, // Not extractable for security
      ['verify'] // Only allow verification operations
    );
    
    return publicKey;
  } catch (error) {
    throw new Error(`Failed to import RSA public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validates JWT signing algorithms against an allowlist to prevent algorithm confusion attacks.
 * 
 * Implements OWASP-recommended algorithm validation using an allowlist approach rather than
 * a denylist. This prevents various JWT vulnerabilities including:
 * - Algorithm confusion attacks (RS256 vs HS256)
 * - "none" algorithm bypass attacks
 * - Case sensitivity exploitation
 * 
 * The validation is case-insensitive to handle variations in algorithm naming while
 * maintaining security through explicit allowlisting.
 * 
 * @param algorithm - The algorithm claim from the JWT header (e.g., "RS256", "HS256")
 * @param allowedAlgorithms - Array of permitted algorithm names for validation
 * @returns True if the algorithm is in the allowlist and secure, false otherwise
 * 
 * @example
 * ```typescript
 * // Secure validation - only allow RS256
 * const isValid = validateAlgorithm("RS256", ["RS256"]);
 * console.log(isValid); // true
 * 
 * // Prevent algorithm confusion attack
 * const isValid2 = validateAlgorithm("HS256", ["RS256"]);
 * console.log(isValid2); // false
 * 
 * // Prevent "none" algorithm bypass
 * const isValid3 = validateAlgorithm("none", ["RS256"]);
 * console.log(isValid3); // false
 * 
 * // Case insensitive validation
 * const isValid4 = validateAlgorithm("rs256", ["RS256"]);
 * console.log(isValid4); // true
 * ```
 * 
 * @security
 * - Uses allowlist approach
 * - Explicitly rejects "none" algorithm
 * - Case-insensitive to prevent bypass attempts
 * - No regex or complex parsing to avoid ReDoS attacks
 */
export function validateAlgorithm(algorithm: string, allowedAlgorithms: string[]): boolean {
  if (typeof algorithm !== 'string' || !algorithm?.trim()) {
    return false;
  }

  if (!Array.isArray(allowedAlgorithms)) {
    return false;
  }
  
  const normalizedAlg = algorithm.toLowerCase();
  const normalizedAllowed = allowedAlgorithms
    .filter(alg => alg?.trim())
    .map(alg => alg.toLowerCase());
  
  if (normalizedAlg === 'none') {
    return false;
  }
  
  return normalizedAllowed.includes(normalizedAlg);
}
