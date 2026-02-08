/**
 * @fileoverview COSE_Mac0 Formatter (pretty extender).
 *
 * Handles CBOR Tag 17: COSE_Mac0 (RFC 9052 §6.2)
 * Structure: [protected, unprotected, payload, tag]
 */
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CoseHeaders, PayloadInfo } from '../coseSign1/coseSign1InspectionTypes';
import { asCborMap, toBuffer } from '../../util';
import {
    buildCoseHeadersMap,
    buildPayloadInfo,
    cleanEmptyHeaders,
    decodeProtectedHeaders,
    delegateAndMergeHeaders,
    estimateTotalSizeBytes,
    getContentTypeString,
    unwrapCoseTag,
} from '../../core/coseMessageCommon';

const COSE_MAC0_TAG = 17;

interface CoseMac0InspectionResult {
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    payload?: PayloadInfo;
    tag: { sizeBytes: number };
    signature?: { totalSizeBytes: number };
}

function isLikelyCoseMac0(value: unknown): value is unknown[] {
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
    // tag: bstr
    const tag = toBuffer(value[3]);
    if (!tag) {
        return false;
    }
    return true;
}

export const CoseMac0Formatter: PrettyFormatter = {
    id: 'cose-mac0',
    order: 102,
    canFormat(value: unknown): boolean {
        const inner = unwrapCoseTag(value, COSE_MAC0_TAG);
        return inner !== null ? isLikelyCoseMac0(inner) : false;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = unwrapCoseTag(value, COSE_MAC0_TAG);
        if (!inner || !isLikelyCoseMac0(inner)) {
            return value;
        }

        const totalSizeBytes = estimateTotalSizeBytes(value, ctx);
        const protectedBytes = toBuffer(inner[0]);
        const unprotected = inner[1];
        const payload = inner[2];
        const macTag = toBuffer(inner[3])!;

        const protectedMap = decodeProtectedHeaders(protectedBytes);
        const unprotectedMap = asCborMap(unprotected);

        const protectedHeaders = buildCoseHeadersMap(ctx, protectedMap);
        const contentType = getContentTypeString(protectedMap);
        const unprotectedHeaders = buildCoseHeadersMap(ctx, unprotectedMap);

        delegateAndMergeHeaders(ctx, protectedMap, unprotectedMap, protectedHeaders, unprotectedHeaders);

        const result: CoseMac0InspectionResult = {
            protectedHeaders,
            unprotectedHeaders,
            payload: buildPayloadInfo(ctx, payload, contentType),
            tag: { sizeBytes: macTag.length },
            signature: { totalSizeBytes }
        };

        cleanEmptyHeaders(result);
        return result;
    }
};
