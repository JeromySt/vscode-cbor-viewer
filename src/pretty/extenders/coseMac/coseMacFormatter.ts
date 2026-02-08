/**
 * @fileoverview COSE_Mac Formatter (pretty extender).
 *
 * Handles CBOR Tag 97: COSE_Mac (RFC 9052 §6.1)
 * Structure: [protected, unprotected, payload, tag, recipients[]]
 * Each recipient: [protected, unprotected, ciphertext]
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

const COSE_MAC_TAG = 97;

interface CoseMacRecipientInfo {
    index: number;
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    ciphertext?: { sizeBytes: number; isPresent: boolean };
}

interface CoseMacInspectionResult {
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    payload?: PayloadInfo;
    tag: { sizeBytes: number };
    recipients: CoseMacRecipientInfo[];
    signature?: { totalSizeBytes: number };
}

function isLikelyCoseMac(value: unknown): value is unknown[] {
    if (!Array.isArray(value) || value.length !== 5) {
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
    // recipients: array
    if (!Array.isArray(value[4])) {
        return false;
    }
    return true;
}

export const CoseMacFormatter: PrettyFormatter = {
    id: 'cose-mac',
    order: 97,
    canFormat(value: unknown): boolean {
        const inner = unwrapCoseTag(value, COSE_MAC_TAG);
        return inner !== null ? isLikelyCoseMac(inner) : false;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = unwrapCoseTag(value, COSE_MAC_TAG);
        if (!inner || !isLikelyCoseMac(inner)) {
            return value;
        }

        const totalSizeBytes = estimateTotalSizeBytes(value, ctx);
        const protectedBytes = toBuffer(inner[0]);
        const unprotected = inner[1];
        const payload = inner[2];
        const macTag = toBuffer(inner[3])!;
        const recipientsArray = inner[4] as unknown[];

        const protectedMap = decodeProtectedHeaders(protectedBytes);
        const unprotectedMap = asCborMap(unprotected);

        const protectedHeaders = buildCoseHeadersMap(ctx, protectedMap);
        const contentType = getContentTypeString(protectedMap);
        const unprotectedHeaders = buildCoseHeadersMap(ctx, unprotectedMap);

        delegateAndMergeHeaders(ctx, protectedMap, unprotectedMap, protectedHeaders, unprotectedHeaders);

        const recipients: CoseMacRecipientInfo[] = recipientsArray.map((r, i) => {
            const recipient: CoseMacRecipientInfo = { index: i };
            if (Array.isArray(r) && r.length === 3) {
                const rProtBytes = toBuffer(r[0]);
                const rUnprot = r[1];
                const rCt = r[2];
                const rProtMap = decodeProtectedHeaders(rProtBytes);
                const rUnprotMap = asCborMap(rUnprot);
                recipient.protectedHeaders = buildCoseHeadersMap(ctx, rProtMap);
                recipient.unprotectedHeaders = buildCoseHeadersMap(ctx, rUnprotMap);
                delegateAndMergeHeaders(ctx, rProtMap, rUnprotMap, recipient.protectedHeaders, recipient.unprotectedHeaders);
                const rCtBytes = toBuffer(rCt);
                recipient.ciphertext = {
                    sizeBytes: rCtBytes ? rCtBytes.length : 0,
                    isPresent: rCtBytes !== null && rCtBytes.length > 0
                };
                cleanEmptyHeaders(recipient);
            }
            return recipient;
        });

        const result: CoseMacInspectionResult = {
            protectedHeaders,
            unprotectedHeaders,
            payload: buildPayloadInfo(ctx, payload, contentType),
            tag: { sizeBytes: macTag.length },
            recipients,
            signature: { totalSizeBytes }
        };

        cleanEmptyHeaders(result);
        return result;
    }
};
