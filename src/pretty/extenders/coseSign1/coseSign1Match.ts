import * as cbor from 'cbor';
import { asCborMap, toBuffer } from '../../util';
import { COSE_SIGN1_TAG } from './coseSign1Types';

/**
 * COSE_Sign1 is commonly transported as CBOR tag 18.
 * Returns the unwrapped value when tag=18, otherwise returns the input.
 */
export function unwrapCoseSign1Tag(value: unknown): unknown {
    if (value instanceof (cbor as any).Tagged) {
        const tag = (value as any).tag;
        const inner = (value as any).value;
        if (tag === COSE_SIGN1_TAG) {
            return inner;
        }
    }
    return value;
}

/**
 * Structural predicate for COSE_Sign1 wire shape.
 * COSE_Sign1 = [ protected: bstr, unprotected: map, payload: bstr/nil, signature: bstr ]
 */
export function isLikelyCoseSign1(value: unknown): value is unknown[] {
    if (!Array.isArray(value) || value.length !== 4) {
        return false;
    }

    const protectedBytes = toBuffer(value[0]);
    const signatureBytes = toBuffer(value[3]);
    if (!protectedBytes || !signatureBytes) {
        return false;
    }

    const unprotectedMap = asCborMap(value[1]) ?? (value[1] instanceof Map ? value[1] : null);
    if (!unprotectedMap) {
        return false;
    }

    const payload = value[2];
    if (!(payload === null || payload === undefined || toBuffer(payload))) {
        return false;
    }

    return true;
}
