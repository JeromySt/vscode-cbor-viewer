/**
 * COSE_Sign1 wire-structure types as defined by RFC 9052.
 *
 * These types are intentionally minimal: the viewer's inspection model and
 * higher-level projections live in separate modules.
 */

/**
 * COSE_Sign1 = [ protected: bstr, unprotected: map, payload: bstr / nil, signature: bstr ]
 */
export type CoseSign1Structure = [protectedHeaders: Uint8Array, unprotectedHeaders: Map<unknown, unknown>, payload: Uint8Array | null, signature: Uint8Array];

/**
 * COSE_Sign1 is commonly transported as CBOR tag 18.
 */
export const COSE_SIGN1_TAG = 18;
