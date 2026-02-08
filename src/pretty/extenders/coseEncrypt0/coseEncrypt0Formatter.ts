/**
 * @fileoverview COSE_Encrypt0 Formatter (pretty extender).
 *
 * Handles CBOR Tag 16: COSE_Encrypt0 (RFC 9052 §5.2)
 * Structure: [protected, unprotected, ciphertext]
 */
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CoseHeaders } from '../coseSign1/coseSign1InspectionTypes';
import { asCborMap, toBuffer } from '../../util';
import {
    buildCoseHeadersMap,
    cleanEmptyHeaders,
    decodeProtectedHeaders,
    delegateAndMergeHeaders,
    estimateTotalSizeBytes,
    unwrapCoseTag,
} from '../../core/coseMessageCommon';

const COSE_ENCRYPT0_TAG = 16;

interface CoseEncrypt0InspectionResult {
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    ciphertext: { sizeBytes: number; isPresent: boolean };
    signature?: { totalSizeBytes: number };
}

function isLikelyCoseEncrypt0(value: unknown): value is unknown[] {
    if (!Array.isArray(value) || value.length !== 3) {
        return false;
    }
    const protectedBytes = toBuffer(value[0]);
    if (!protectedBytes) {
        return false;
    }
    const unprotectedMap = asCborMap(value[1]) ?? (value[1] instanceof Map ? value[1] : null);
    if (!unprotectedMap) {
        return false;
    }
    // ciphertext: bstr / nil
    const ct = value[2];
    if (!(ct === null || ct === undefined || toBuffer(ct))) {
        return false;
    }
    return true;
}

export const CoseEncrypt0Formatter: PrettyFormatter = {
    id: 'cose-encrypt0',
    order: 101,
    canFormat(value: unknown): boolean {
        const inner = unwrapCoseTag(value, COSE_ENCRYPT0_TAG);
        return inner !== null ? isLikelyCoseEncrypt0(inner) : false;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = unwrapCoseTag(value, COSE_ENCRYPT0_TAG);
        if (!inner || !isLikelyCoseEncrypt0(inner)) {
            return value;
        }

        const totalSizeBytes = estimateTotalSizeBytes(value, ctx);
        const protectedBytes = toBuffer(inner[0]);
        const unprotected = inner[1];
        const ciphertext = inner[2];

        const protectedMap = decodeProtectedHeaders(protectedBytes);
        const unprotectedMap = asCborMap(unprotected);

        const protectedHeaders = buildCoseHeadersMap(ctx, protectedMap);
        const unprotectedHeaders = buildCoseHeadersMap(ctx, unprotectedMap);

        delegateAndMergeHeaders(ctx, protectedMap, unprotectedMap, protectedHeaders, unprotectedHeaders);

        const ctBytes = toBuffer(ciphertext);

        const result: CoseEncrypt0InspectionResult = {
            protectedHeaders,
            unprotectedHeaders,
            ciphertext: {
                sizeBytes: ctBytes ? ctBytes.length : 0,
                isPresent: ctBytes !== null && ctBytes.length > 0
            },
            signature: { totalSizeBytes }
        };

        cleanEmptyHeaders(result);
        return result;
    }
};
