import * as cbor from 'cbor';
import { createHash } from 'crypto';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CwtClaimsInfo } from '../cwtClaims/cwtClaimsTypes';
import type {
    AlgorithmInfo,
    CoseInspectionResult,
    HeaderInfo,
    PayloadInfo,
    ProtectedHeadersInfo,
    SignatureInfo
} from './coseSign1InspectionTypes';
import { toInt32 } from '../../core/numeric';
import { asCborMap, toBuffer } from '../../util';
import { isLikelyCoseSign1, unwrapCoseSign1Tag } from './coseSign1Match';

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

    const protectedHeaders = buildProtectedHeadersInfo(ctx, protectedMap);

    // Delegate x5t/x5chain/x5bag and X509 parsing to the certificate extender.
    const certificateExt = ctx.format(
        {
            _type: 'cose-certificates',
            protectedHeaders: protectedMap,
            unprotectedHeaders: unprotectedMap
        },
        ctx.depth + 1
    ) as any;

    if (certificateExt?.protectedHeaders) {
        Object.assign(protectedHeaders, certificateExt.protectedHeaders);
    }

    // Delegate COSE-Hash-Message (RFC 9338) header projections to the hash-message extender.
    const hashMessageExt = ctx.format(
        {
            _type: 'cose-hash-message',
            protectedHeaders: protectedMap
        },
        ctx.depth + 1
    ) as any;

    if (hashMessageExt?.protectedHeaders) {
        Object.assign(protectedHeaders, hashMessageExt.protectedHeaders);
    }

    const cwtClaimsCandidate = protectedMap.get(15);
    const formattedCwtClaims = ctx.format(cwtClaimsCandidate, ctx.depth + 1) as unknown;
    const cwtClaims =
        formattedCwtClaims &&
        typeof formattedCwtClaims === 'object' &&
        Object.keys(formattedCwtClaims as Record<string, unknown>).length > 0
            ? (formattedCwtClaims as CwtClaimsInfo)
            : undefined;

    const result: CoseInspectionResult = {
        protectedHeaders,
        unprotectedHeaders: buildUnprotectedHeaders(ctx, unprotectedMap),
        cwtClaims,
        payload: buildPayloadInfo(ctx, payload, protectedHeaders?.contentType),
        signature: buildSignatureInfo(totalSizeBytes, certificateExt?.signature),
        certificates: certificateExt?.certificates
    };

    if (!result.unprotectedHeaders || result.unprotectedHeaders.length === 0) {
        delete result.unprotectedHeaders;
    }
    if (!result.certificates || result.certificates.length === 0) {
        delete result.certificates;
    }
    if (result.protectedHeaders && Object.keys(result.protectedHeaders).length === 0) {
        delete result.protectedHeaders;
    }

    return result;
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

function buildProtectedHeadersInfo(ctx: PrettyFormatterContext, headers: Map<unknown, unknown>): ProtectedHeadersInfo {
    const info: ProtectedHeadersInfo = {};

    // alg (1)
    const algValue = headers.get(1);
    const algId = toInt32(algValue);
    if (algId !== null) {
        info.algorithm = { id: algId, name: getAlgorithmName(algId) };
    }

    // content type (3): tstr or int
    const contentType = headers.get(3);
    if (typeof contentType === 'string') {
        info.contentType = contentType;
    } else {
        const ctInt = toInt32(contentType);
        if (ctInt !== null) {
            info.contentType = ctInt.toString();
        }
    }

    // crit (2): array of labels
    const crit = headers.get(2);
    if (Array.isArray(crit)) {
        const critStrings = crit
            .map(v => {
                if (typeof v === 'string') {
                    return v;
                }
                const n = toInt32(v);
                return n === null ? undefined : n.toString();
            })
            .filter((v): v is string => typeof v === 'string');
        if (critStrings.length > 0) {
            info.criticalHeaders = critStrings;
        }
    }

    const otherHeaders: HeaderInfo[] = [];
    for (const [key, value] of headers.entries()) {
        const labelId = toInt32(key);
        if (
            labelId === 1 ||
            labelId === 2 ||
            labelId === 3 ||
            labelId === 15 ||
            labelId === 32 ||
            labelId === 33 ||
            labelId === 34 ||
            labelId === 35 ||
            labelId === 258 ||
            labelId === 259 ||
            labelId === 260
        ) {
            continue;
        }
        otherHeaders.push(buildHeaderInfo(ctx, key, value));
    }

    if (otherHeaders.length > 0) {
        info.otherHeaders = otherHeaders;
    }

    return info;
}

function buildUnprotectedHeaders(ctx: PrettyFormatterContext, headers: Map<unknown, unknown> | null): HeaderInfo[] | undefined {
    if (!headers || headers.size === 0) {
        return undefined;
    }

    const result: HeaderInfo[] = [];
    for (const [key, value] of headers.entries()) {
        result.push(buildHeaderInfo(ctx, key, value));
    }
    return result;
}

function buildHeaderInfo(ctx: PrettyFormatterContext, label: unknown, value: unknown): HeaderInfo {
    const labelId = toInt32(label);
    const info: HeaderInfo = {
        label: ctx.labels.getCoseHeaderName(labelId),
        lengthBytes: getEncodedLengthBytes(value)
    };

    if (labelId !== null) {
        info.labelId = labelId;
    }

    const meta = getValueTypeAndMetadata(value);
    info.valueType = meta.valueType;

    // Avoid dumping certificate blobs; certificates are surfaced via `certificates`.
    if (meta.valueType === 'bytes' || meta.valueType === 'array' || meta.valueType === 'map') {
        info.lengthBytes = meta.lengthBytes;
        if (labelId === 32 || labelId === 33) {
            return info;
        }
        info.value = ctx.format(value, 0);
        return info;
    }

    if (meta.value !== undefined) {
        info.value = meta.value;
    }

    return info;
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
    info.isText = isLikelyText(payloadBytes);

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

function buildSignatureInfo(totalSizeBytes: number, certificateSignatureExt?: Partial<SignatureInfo>): SignatureInfo {
    const info: SignatureInfo = { totalSizeBytes };
    if (certificateSignatureExt && typeof certificateSignatureExt === 'object') {
        if (certificateSignatureExt.certificateChainLocation) {
            info.certificateChainLocation = certificateSignatureExt.certificateChainLocation;
        }
        if (certificateSignatureExt.certificateBagLocation) {
            info.certificateBagLocation = certificateSignatureExt.certificateBagLocation;
        }
    }
    return info;
}

function isLikelyText(bytes: Buffer): boolean {
    if (bytes.length === 0) {
        return false;
    }

    const sample = bytes.subarray(0, Math.min(1000, bytes.length));
    let printableCount = 0;
    for (const b of sample) {
        if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
            printableCount++;
        }
    }

    return printableCount > sample.length * 0.8;
}

function getEncodedLengthBytes(value: unknown): number | undefined {
    try {
        const encoded = cbor.encodeOne(value as any);
        return Buffer.isBuffer(encoded) ? encoded.length : Buffer.from(encoded).length;
    } catch {
        return undefined;
    }
}

function getValueTypeAndMetadata(value: unknown): { valueType: HeaderInfo['valueType']; value?: unknown; lengthBytes?: number } {
    if (value === null || value === undefined) {
        return { valueType: 'unknown' };
    }

    if (typeof value === 'string') {
        return { valueType: 'string', value };
    }

    if (typeof value === 'number') {
        return { valueType: value >= 0 ? 'uint' : 'int', value };
    }

    if (typeof value === 'bigint') {
        const asString = value.toString();
        return value >= 0n ? { valueType: 'uint', value: asString } : { valueType: 'int', value: asString };
    }

    if (typeof value === 'boolean') {
        return { valueType: 'bool', value };
    }

    const b = toBuffer(value);
    if (b) {
        return { valueType: 'bytes', lengthBytes: b.length };
    }

    if (Array.isArray(value)) {
        // Use CBOR-encoded length as an approximation.
        return { valueType: 'array', lengthBytes: getEncodedLengthBytes(value) };
    }

    if (value instanceof Map) {
        return { valueType: 'map', lengthBytes: getEncodedLengthBytes(value) };
    }

    if (value !== null && typeof value === 'object') {
        const map = asCborMap(value);
        if (map && !(value instanceof Map)) {
            return { valueType: 'map', lengthBytes: getEncodedLengthBytes(value) };
        }
        return { valueType: 'unknown', value };
    }

    return { valueType: 'unknown', value };
}

function getAlgorithmName(alg: number): string {
    switch (alg) {
        case -7:
            return 'ES256 (ECDSA w/ SHA-256)';
        case -35:
            return 'ES384 (ECDSA w/ SHA-384)';
        case -36:
            return 'ES512 (ECDSA w/ SHA-512)';
        case -37:
            return 'PS256 (RSASSA-PSS w/ SHA-256)';
        case -38:
            return 'PS384 (RSASSA-PSS w/ SHA-384)';
        case -39:
            return 'PS512 (RSASSA-PSS w/ SHA-512)';
        case -257:
            return 'RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)';
        case -258:
            return 'RS384 (RSASSA-PKCS1-v1_5 w/ SHA-384)';
        case -259:
            return 'RS512 (RSASSA-PKCS1-v1_5 w/ SHA-512)';
        default:
            return 'Unknown';
    }
}


