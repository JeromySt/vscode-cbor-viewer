/**
 * @fileoverview Cose Sign1 Formatter (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import * as cbor from 'cbor';
import { createHash } from 'crypto';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type {
    CoseHeaders,
    CoseInspectionResult,
    HeaderInfo,
    PayloadInfo,
    SignatureInfo
} from './coseSign1InspectionTypes';
import { toInt32 } from '../../core/numeric';
import { asCborMap, isLikelyUtf8Text, toBuffer } from '../../util';
import { isLikelyCoseSign1, unwrapCoseSign1Tag } from './coseSign1Match';
import { buildCoseHeadersMap, mergeHeaderContributions } from './coseHeaders';

/**
 * COSE_Sign1 inspection formatter.
 *
 * Extender philosophy:
 * - This formatter focuses on COSE_Sign1 structure recognition and producing the
 *   top-level inspection model.
 * - Domain projections (like CWT claims) are delegated via `ctx.format(...)`.
 * - Label mapping is delegated via `ctx.labels` (extender-registered).
 */
export const CoseSign1Formatter: PrettyFormatter = {
    id: 'cose-sign1',
    order: 100,
    canFormat(value: unknown, ctx: PrettyFormatterContext): boolean {
        void ctx;
        // Support both tagged-18 and already-unwrapped Sign1 arrays.
        const candidate = unwrapCoseSign1Tag(value);
        return isLikelyCoseSign1(candidate);
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const candidate = unwrapCoseSign1Tag(value);
        if (!isLikelyCoseSign1(candidate)) {
            return value;
        }

        // Prefer the actual byte length of the source document when available.
        // Re-encoding a Tagged value can produce a different (but equivalent) representation.
        const totalSizeBytes = (() => {
            if (typeof ctx.totalSizeBytes === 'number' && ctx.totalSizeBytes > 0) {
                return ctx.totalSizeBytes;
            }

            if (value instanceof (cbor as any).Tagged) {
                try {
                    const encoded = cbor.encodeOne(value as any);
                    const buf = Buffer.isBuffer(encoded) ? encoded : Buffer.from(encoded);
                    return buf.length;
                } catch {
                    return 0;
                }
            }

            return 0;
        })();

        return inspectCoseSign1(ctx, candidate, totalSizeBytes);
    }
};

/**
 * COSE_Sign1 = [ protected: bstr, unprotected: map, payload: bstr/nil, signature: bstr ]
 */
function inspectCoseSign1(ctx: PrettyFormatterContext, data: unknown[], totalSizeBytes: number): CoseInspectionResult {
    const protectedBytes = toBuffer(data[0]);
    const unprotected = data[1];
    const payload = data[2];

    const protectedMap = decodeProtectedHeaders(protectedBytes);
    const unprotectedMap = asCborMap(unprotected);

    const protectedHeaders = buildCoseHeadersMap(ctx, protectedMap);
    const contentType = getContentTypeString(protectedMap);

    const unprotectedHeaders = buildCoseHeadersMap(ctx, unprotectedMap);

    // Delegate COSE base header alg (1) interpretation to a helper formatter.
    const coseAlgExt = ctx.format(
        {
            _type: 'cose-alg',
            protectedHeaders: protectedMap,
            unprotectedHeaders: unprotectedMap
        },
        ctx.depth + 1
    ) as any;

    // Delegate x5t/x5chain/x5bag and X509 parsing to the certificate extender.
    const certificateExt = ctx.format(
        {
            _type: 'cose-certificates',
            protectedHeaders: protectedMap,
            unprotectedHeaders: unprotectedMap
        },
        ctx.depth + 1
    ) as any;

    // Delegate COSE_Hash_Msg header interpretation (draft-ietf-cose-hash-envelope) to its extender.
    const coseHashMsgExt = ctx.format(
        {
            _type: 'cose-hash-message',
            protectedHeaders: protectedMap,
            unprotectedHeaders: unprotectedMap
        },
        ctx.depth + 1
    ) as any;

    // Delegate countersignature header interpretation (RFC 9338) to its extender.
    const countersigExt = ctx.format(
        {
            _type: 'cose-countersignature',
            protectedHeaders: protectedMap,
            unprotectedHeaders: unprotectedMap
        },
        ctx.depth + 1
    ) as any;

    // Header extenders should contribute under the header label they extend.
    if (certificateExt && typeof certificateExt === 'object') {
        if (certificateExt.protectedHeaders && typeof certificateExt.protectedHeaders === 'object') {
            mergeHeaderContributions(protectedHeaders, certificateExt.protectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
        if (certificateExt.unprotectedHeaders && typeof certificateExt.unprotectedHeaders === 'object') {
            mergeHeaderContributions(unprotectedHeaders, certificateExt.unprotectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
    }

    if (coseHashMsgExt && typeof coseHashMsgExt === 'object') {
        if (coseHashMsgExt.protectedHeaders && typeof coseHashMsgExt.protectedHeaders === 'object') {
            mergeHeaderContributions(protectedHeaders, coseHashMsgExt.protectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
        if (coseHashMsgExt.unprotectedHeaders && typeof coseHashMsgExt.unprotectedHeaders === 'object') {
            mergeHeaderContributions(unprotectedHeaders, coseHashMsgExt.unprotectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
    }

    if (countersigExt && typeof countersigExt === 'object') {
        if (countersigExt.protectedHeaders && typeof countersigExt.protectedHeaders === 'object') {
            mergeHeaderContributions(protectedHeaders, countersigExt.protectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
        if (countersigExt.unprotectedHeaders && typeof countersigExt.unprotectedHeaders === 'object') {
            mergeHeaderContributions(unprotectedHeaders, countersigExt.unprotectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
    }

    if (coseAlgExt && typeof coseAlgExt === 'object') {
        if (coseAlgExt.protectedHeaders && typeof coseAlgExt.protectedHeaders === 'object') {
            mergeHeaderContributions(protectedHeaders, coseAlgExt.protectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
        if (coseAlgExt.unprotectedHeaders && typeof coseAlgExt.unprotectedHeaders === 'object') {
            mergeHeaderContributions(unprotectedHeaders, coseAlgExt.unprotectedHeaders as Record<string, Partial<HeaderInfo>>);
        }
    }

    // Do not merge derived header projections into `protectedHeaders`.
    // The inspection output should reflect the COSE header map keys/values directly.

    const result: CoseInspectionResult = {
        protectedHeaders,
        unprotectedHeaders,
        payload: buildPayloadInfo(ctx, payload, contentType),
        signature: buildSignatureInfo(totalSizeBytes)
    };

    if (!result.unprotectedHeaders || Object.keys(result.unprotectedHeaders).length === 0) {
        delete result.unprotectedHeaders;
    }
    if (result.protectedHeaders && Object.keys(result.protectedHeaders).length === 0) {
        delete result.protectedHeaders;
    }

    return result;
}

function getContentTypeString(headers: Map<unknown, unknown>): string | undefined {
    const contentType = headers.get(3);
    if (typeof contentType === 'string') {
        return contentType;
    }
    const ctInt = toInt32(contentType);
    return ctInt === null ? undefined : ctInt.toString();
}

function decodeProtectedHeaders(protectedBytes: Buffer | null): Map<unknown, unknown> {
    if (!protectedBytes || protectedBytes.length === 0) {
        return new Map();
    }

    try {
        const decoded = cbor.decodeFirstSync(protectedBytes);
        return asCborMap(decoded) ?? new Map();
    } catch {
        return new Map();
    }
}

function buildPayloadInfo(ctx: PrettyFormatterContext, payload: unknown, contentType?: string): PayloadInfo {
    const payloadBytes = toBuffer(payload);
    const isEmbedded = !!(payloadBytes && payloadBytes.length > 0);

    const info: PayloadInfo = { isEmbedded };
    if (contentType) {
        info.contentType = contentType;
    }

    if (!isEmbedded || !payloadBytes) {
        return info;
    }

    info.sizeBytes = payloadBytes.length;
    info.isText = isLikelyUtf8Text(payloadBytes);

    // Always register payload bytes so the UI can open them.
    // We reuse ctx.bytesPreview so preview hints are consistent.
    const preview = ctx.bytesPreview(payloadBytes) as any;
    if (preview && preview._type === 'bytes') {
        info.bytes = preview;
    }

    if (info.isText) {
        // Text previews are generated by the preview generator based on `_previewHints`.
    } else {
        info.sha256 = createHash('sha256').update(payloadBytes).digest('hex').toUpperCase();

        // Decode embedded CBOR/COSE for reasonable sizes.
        if (payloadBytes.length <= 1024 * 1024) {
            const decoded = ctx.tryDecodeEmbedded(payloadBytes, 0);
            if (decoded !== undefined) {
                info.decoded = ctx.format(decoded, 1);
            }
        }
    }

    return info;
}

function buildSignatureInfo(totalSizeBytes: number): SignatureInfo {
    const info: SignatureInfo = { totalSizeBytes };
    return info;
}




