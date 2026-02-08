/**
 * @fileoverview COSE_Sign Formatter (pretty extender).
 *
 * Handles CBOR Tag 98: COSE_Sign (RFC 9052 §4.1)
 * Structure: [protected, unprotected, payload, signatures[]]
 * Each signature: [protected, unprotected, signature]
 */
import * as cbor from 'cbor';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CoseHeaders, CoseInspectionResult, PayloadInfo } from '../coseSign1/coseSign1InspectionTypes';
import { asCborMap, toBuffer } from '../../util';
import {
    buildCoseHeadersMap,
    buildPayloadInfo,
    buildSignatureInfo,
    cleanEmptyHeaders,
    decodeProtectedHeaders,
    delegateAndMergeHeaders,
    estimateTotalSizeBytes,
    getContentTypeString,
    unwrapCoseTag,
} from '../../core/coseMessageCommon';

const COSE_SIGN_TAG = 98;

interface CoseSignInspectionResult {
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    payload?: PayloadInfo;
    signatures: CoseSignerInfo[];
    signature?: { totalSizeBytes: number };
}

interface CoseSignerInfo {
    index: number;
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
}

function isLikelyCoseSign(value: unknown): value is unknown[] {
    if (!Array.isArray(value) || value.length !== 4) {
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
    // payload: bstr / nil
    const payload = value[2];
    if (!(payload === null || payload === undefined || toBuffer(payload))) {
        return false;
    }
    // signatures: array of arrays
    if (!Array.isArray(value[3])) {
        return false;
    }
    return true;
}

export const CoseSignFormatter: PrettyFormatter = {
    id: 'cose-sign',
    order: 99,
    canFormat(value: unknown): boolean {
        const inner = unwrapCoseTag(value, COSE_SIGN_TAG);
        return inner !== null ? isLikelyCoseSign(inner) : false;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = unwrapCoseTag(value, COSE_SIGN_TAG);
        if (!inner || !isLikelyCoseSign(inner)) {
            return value;
        }

        const totalSizeBytes = estimateTotalSizeBytes(value, ctx);
        const data = inner;

        const protectedBytes = toBuffer(data[0]);
        const unprotected = data[1];
        const payload = data[2];
        const signaturesArray = data[3] as unknown[];

        const protectedMap = decodeProtectedHeaders(protectedBytes);
        const unprotectedMap = asCborMap(unprotected);

        const protectedHeaders = buildCoseHeadersMap(ctx, protectedMap);
        const contentType = getContentTypeString(protectedMap);
        const unprotectedHeaders = buildCoseHeadersMap(ctx, unprotectedMap);

        delegateAndMergeHeaders(ctx, protectedMap, unprotectedMap, protectedHeaders, unprotectedHeaders);

        const signatures: CoseSignerInfo[] = signaturesArray.map((sig, i) => {
            const signer: CoseSignerInfo = { index: i };
            if (Array.isArray(sig) && sig.length === 3) {
                const sigProtBytes = toBuffer(sig[0]);
                const sigUnprot = sig[1];
                const sigProtMap = decodeProtectedHeaders(sigProtBytes);
                const sigUnprotMap = asCborMap(sigUnprot);
                signer.protectedHeaders = buildCoseHeadersMap(ctx, sigProtMap);
                signer.unprotectedHeaders = buildCoseHeadersMap(ctx, sigUnprotMap);
                delegateAndMergeHeaders(ctx, sigProtMap, sigUnprotMap, signer.protectedHeaders, signer.unprotectedHeaders);
                cleanEmptyHeaders(signer);
            }
            return signer;
        });

        const result: CoseSignInspectionResult = {
            protectedHeaders,
            unprotectedHeaders,
            payload: buildPayloadInfo(ctx, payload, contentType),
            signatures,
            signature: buildSignatureInfo(totalSizeBytes)
        };

        cleanEmptyHeaders(result);
        return result;
    }
};
