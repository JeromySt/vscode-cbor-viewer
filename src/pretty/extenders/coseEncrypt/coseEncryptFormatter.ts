/**
 * @fileoverview COSE_Encrypt Formatter (pretty extender).
 *
 * Handles CBOR Tag 96: COSE_Encrypt (RFC 9052 §5.1)
 * Structure: [protected, unprotected, ciphertext, recipients[]]
 * Each recipient: [protected, unprotected, ciphertext]
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

const COSE_ENCRYPT_TAG = 96;

interface CoseRecipientInfo {
    index: number;
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    ciphertext?: { sizeBytes: number; isPresent: boolean };
}

interface CoseEncryptInspectionResult {
    protectedHeaders?: CoseHeaders;
    unprotectedHeaders?: CoseHeaders;
    ciphertext: { sizeBytes: number; isPresent: boolean };
    recipients: CoseRecipientInfo[];
    signature?: { totalSizeBytes: number };
}

function isLikelyCoseEncrypt(value: unknown): value is unknown[] {
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
    // ciphertext: bstr / nil
    const ct = value[2];
    if (!(ct === null || ct === undefined || toBuffer(ct))) {
        return false;
    }
    // recipients: array
    if (!Array.isArray(value[3])) {
        return false;
    }
    return true;
}

export const CoseEncryptFormatter: PrettyFormatter = {
    id: 'cose-encrypt',
    // Must run before Sign (99) since both are 4-element tagged arrays.
    // Tag check ensures no conflict.
    order: 98,
    canFormat(value: unknown): boolean {
        const inner = unwrapCoseTag(value, COSE_ENCRYPT_TAG);
        return inner !== null ? isLikelyCoseEncrypt(inner) : false;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = unwrapCoseTag(value, COSE_ENCRYPT_TAG);
        if (!inner || !isLikelyCoseEncrypt(inner)) {
            return value;
        }

        const totalSizeBytes = estimateTotalSizeBytes(value, ctx);
        const protectedBytes = toBuffer(inner[0]);
        const unprotected = inner[1];
        const ciphertext = inner[2];
        const recipientsArray = inner[3] as unknown[];

        const protectedMap = decodeProtectedHeaders(protectedBytes);
        const unprotectedMap = asCborMap(unprotected);

        const protectedHeaders = buildCoseHeadersMap(ctx, protectedMap);
        const unprotectedHeaders = buildCoseHeadersMap(ctx, unprotectedMap);

        delegateAndMergeHeaders(ctx, protectedMap, unprotectedMap, protectedHeaders, unprotectedHeaders);

        const ctBytes = toBuffer(ciphertext);

        const recipients: CoseRecipientInfo[] = recipientsArray.map((r, i) => {
            const recipient: CoseRecipientInfo = { index: i };
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

        const result: CoseEncryptInspectionResult = {
            protectedHeaders,
            unprotectedHeaders,
            ciphertext: {
                sizeBytes: ctBytes ? ctBytes.length : 0,
                isPresent: ctBytes !== null && ctBytes.length > 0
            },
            recipients,
            signature: { totalSizeBytes }
        };

        cleanEmptyHeaders(result);
        return result;
    }
};
