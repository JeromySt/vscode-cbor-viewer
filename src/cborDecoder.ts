import * as cbor from 'cbor';
import { createHash, X509Certificate } from 'crypto';

export interface DecodeResult {
    value: unknown;
    blobs: Map<string, Buffer>;
}

export interface DecodeViewsResult {
    pretty: unknown;
    raw: unknown;
    blobs: Map<string, Buffer>;
}

interface DecodeContext {
    blobs: Map<string, Buffer>;
    nextBlobId: number;
}

function createDecodeContext(): DecodeContext {
    return {
        blobs: new Map<string, Buffer>(),
        nextBlobId: 1
    };
}

function registerBlob(ctx: DecodeContext, bytes: Buffer): string {
    const id = `blob-${ctx.nextBlobId++}`;
    ctx.blobs.set(id, bytes);
    return id;
}

export interface CoseInspectionResult {
    protectedHeaders?: ProtectedHeadersInfo;
    unprotectedHeaders?: HeaderInfo[];
    cwtClaims?: CwtClaimsInfo;
    payload?: PayloadInfo;
    signature?: SignatureInfo;
    certificates?: CertificateInfo[];
}

export interface ProtectedHeadersInfo {
    algorithm?: AlgorithmInfo;
    contentType?: string;
    criticalHeaders?: string[];
    certificateThumbprint?: CertificateThumbprintInfo;
    certificateChainLength?: number;
    payloadHashAlgorithm?: AlgorithmInfo;
    preimageContentType?: string;
    payloadLocation?: string;
    otherHeaders?: HeaderInfo[];
}

export interface AlgorithmInfo {
    id: number;
    name: string;
}

export interface CertificateThumbprintInfo {
    algorithm?: string;
    value?: string;
}

export interface HeaderInfo {
    label?: string;
    labelId?: number;
    value?: unknown;
    valueType?: 'string' | 'uint' | 'int' | 'bytes' | 'array' | 'map' | 'bool' | 'unknown' | 'binary';
    lengthBytes?: number;
}

export interface CwtClaimsInfo {
    issuer?: string;
    subject?: string;
    audience?: string;
    issuedAt?: string;
    issuedAtUnix?: number;
    notBefore?: string;
    notBeforeUnix?: number;
    expirationTime?: string;
    expirationTimeUnix?: number;
    isExpired?: boolean;
    cwtId?: string;
    customClaimsCount?: number;
    customClaims?: ClaimInfo[];
}

export interface ClaimInfo {
    label?: string;
    labelId?: number;
    value?: unknown;
    valueType?: HeaderInfo['valueType'];
    lengthBytes?: number;
}

export interface PayloadInfo {
    isEmbedded: boolean;
    sizeBytes?: number;
    contentType?: string;
    isText?: boolean;
    bytes?: BytesPreview;
    sha256?: string;
    decoded?: unknown;
}

export interface BytesPreview {
    _type: 'bytes';
    lengthBytes: number;
    hexPreview: string;
    textPreview?: string;
    _hexBlobId: string;
}

export interface SignatureInfo {
    totalSizeBytes: number;
    certificateChainLocation?: 'protected' | 'unprotected';
}

export interface CertificateInfo {
    subject?: string;
    issuer?: string;
    serialNumber?: string;
    thumbprint?: string;
    notBefore?: string;
    notAfter?: string;
    isExpired?: boolean;
    keyAlgorithm?: string;
    signatureAlgorithm?: string;
}

/**
 * Decode CBOR data to a JavaScript object
 * @param data Buffer containing CBOR-encoded data
 * @returns Decoded JavaScript object
 */
export function decodeCbor(data: Uint8Array): unknown {
    return decodeCborWithBlobs(data).value;
}

export function decodeCborWithBlobs(data: Uint8Array): DecodeResult {
    try {
        // Convert Uint8Array to Buffer for the cbor library
        const buffer = Buffer.from(data);

        // Decode the CBOR data
        const decoded = cbor.decodeFirstSync(buffer);

        return decodeCborDecodedValueWithBlobs(decoded, buffer.length);
    } catch (error) {
        throw new Error(`Failed to decode CBOR data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function decodeCborWithViews(data: Uint8Array): DecodeViewsResult {
    try {
        const buffer = Buffer.from(data);
        const decoded = cbor.decodeFirstSync(buffer);
        return decodeCborDecodedValueWithViews(decoded, buffer.length);
    } catch (error) {
        throw new Error(`Failed to decode CBOR data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Post-process an already-decoded CBOR value into the viewer's output shape (including COSE inspection)
 * while collecting any byte blobs for hex viewing.
 */
export function decodeCborDecodedValueWithBlobs(decoded: unknown, totalSizeBytes: number): DecodeResult {
    const views = decodeCborDecodedValueWithViews(decoded, totalSizeBytes);
    return { value: views.pretty, blobs: views.blobs };
}

export function decodeCborDecodedValueWithViews(decoded: unknown, totalSizeBytes: number): DecodeViewsResult {
    const ctx = createDecodeContext();
    const pretty = buildPrettyView(ctx, decoded, totalSizeBytes);
    const raw = expandCborRawValue(ctx, decoded, 0);
    return { pretty, raw, blobs: ctx.blobs };
}

function buildPrettyView(ctx: DecodeContext, decoded: unknown, totalSizeBytes: number): unknown {
    // Try to detect and parse COSE structures
    const coseCandidate = unwrapCoseTag(decoded);
    if (isLikelyCoseSign1(coseCandidate)) {
        return inspectCoseSign1(ctx, coseCandidate, totalSizeBytes);
    }

    // For non-COSE CBOR, still render bytes safely and recursively look for embedded CBOR/COSE.
    return expandCborValue(ctx, decoded, 0);
}

/**
 * COSE_Sign1 = [
 *   protected: bstr,
 *   unprotected: {* label => value},
 *   payload: bstr / nil,
 *   signature: bstr
 * ]
 */
function inspectCoseSign1(ctx: DecodeContext, data: unknown[], totalSizeBytes: number): CoseInspectionResult {
    const protectedBytes = toBuffer(data[0]);
    const unprotected = data[1];
    const payload = data[2];

    const protectedMap = decodeProtectedHeaders(protectedBytes);
    const unprotectedMap = asCborMap(unprotected);

    const protectedHeaders = buildProtectedHeadersInfo(ctx, protectedMap);

    const result: CoseInspectionResult = {
        protectedHeaders,
        unprotectedHeaders: buildUnprotectedHeaders(ctx, unprotectedMap),
        cwtClaims: buildCwtClaimsInfo(ctx, protectedMap),
        payload: buildPayloadInfo(ctx, payload, protectedHeaders?.contentType),
        signature: buildSignatureInfo(protectedMap, unprotectedMap, totalSizeBytes),
        certificates: buildCertificateInfo(protectedMap, unprotectedMap)
    };

    // Drop empty objects/arrays to keep output tidy (similar to JSON formatter ignoring nulls).
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

function unwrapCoseTag(decoded: unknown): unknown {
    // COSE_Sign1 is commonly tagged with CBOR tag 18.
    if (decoded instanceof (cbor as any).Tagged) {
        const tag = (decoded as any).tag;
        const value = (decoded as any).value;
        if (tag === 18) {
            return value;
        }
    }
    return decoded;
}

const MAX_EMBEDDED_DECODE_DEPTH = 6;
const HEX_PREVIEW_BYTES = 20;

const PAYLOAD_PREVIEW_TOKEN = '___CBOR_PAYLOAD_PREVIEW___';

function formatBytesPreview(
    ctx: DecodeContext,
    bytes: Buffer,
    existingBlobId?: string
): BytesPreview {
    const previewLen = Math.min(bytes.length, HEX_PREVIEW_BYTES);
    const preview = bytes.subarray(0, previewLen).toString('hex');
    const suffix = bytes.length > previewLen ? '...' : '';
    const out: BytesPreview = {
        _type: 'bytes',
        lengthBytes: bytes.length,
        hexPreview: `${preview}${suffix}`,
        _hexBlobId: existingBlobId ?? registerBlob(ctx, bytes)
    };
    return out;
}

function expandCborValue(ctx: DecodeContext, value: unknown, depth: number): unknown {
    if (depth >= MAX_EMBEDDED_DECODE_DEPTH) {
        return renderValueAtDepthLimit(ctx, value);
    }

    if (value instanceof (cbor as any).Tagged) {
        const tag = (value as any).tag;
        const inner = (value as any).value;

        // If it is COSE_Sign1, decode into inspection output.
        if (tag === 18) {
            const candidate = unwrapCoseTag(value);
            if (isLikelyCoseSign1(candidate)) {
                return inspectCoseSign1(ctx, candidate, getEncodedLengthBytes(value) ?? 0);
            }
        }

        return {
            _cborTag: tag,
            value: expandCborValue(ctx, inner, depth + 1)
        };
    }

    const buffer = toBuffer(value);
    if (buffer) {
        return tryDecodeEmbeddedCborOrCose(ctx, buffer, depth) ?? formatBytesPreview(ctx, buffer);
    }

    if (Array.isArray(value)) {
        return value.map(v => expandCborValue(ctx, v, depth + 1));
    }

    if (value instanceof Map) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of value.entries()) {
            result[mapKeyToString(k)] = expandCborValue(ctx, v, depth + 1);
        }
        return result;
    }

    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = expandCborValue(ctx, v, depth + 1);
        }
        return out;
    }

    return value;
}

function isByteArray(value: unknown): value is number[] {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }
    for (let i = 0; i < value.length; i++) {
        const n = value[i];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) {
            return false;
        }
    }
    return true;
}

/**
 * Raw view:
 * - No COSE/CWT prettification
 * - No embedded CBOR decoding
 * - Preserve map keys by rendering maps as entry arrays
 * - Render bytes (and large byte arrays) as compact previews with hex-editor links
 */
function expandCborRawValue(ctx: DecodeContext, value: unknown, depth: number): unknown {
    if (depth >= MAX_EMBEDDED_DECODE_DEPTH) {
        return renderRawValueAtDepthLimit(ctx, value);
    }

    if (value instanceof (cbor as any).Tagged) {
        const tag = (value as any).tag;
        const inner = (value as any).value;
        return {
            _cborTag: tag,
            value: expandCborRawValue(ctx, inner, depth + 1)
        };
    }

    const buffer = toBuffer(value);
    if (buffer) {
        return formatBytesPreview(ctx, buffer);
    }

    if (Array.isArray(value)) {
        // If this looks like a byte array (common when CBOR contains an array of bytes), show it compactly.
        if (isByteArray(value) && value.length > HEX_PREVIEW_BYTES) {
            return formatBytesPreview(ctx, Buffer.from(value));
        }
        return value.map(v => expandCborRawValue(ctx, v, depth + 1));
    }

    if (value instanceof Map) {
        const entries: Array<{ key: unknown; value: unknown }> = [];
        for (const [k, v] of value.entries()) {
            entries.push({
                key: expandCborRawValue(ctx, k, depth + 1),
                value: expandCborRawValue(ctx, v, depth + 1)
            });
        }
        return { _type: 'map', entries };
    }

    if (value !== null && typeof value === 'object') {
        const map = asCborMap(value);
        if (map && !(value instanceof Map)) {
            const entries: Array<{ key: unknown; value: unknown }> = [];
            for (const [k, v] of map.entries()) {
                entries.push({
                    key: expandCborRawValue(ctx, k, depth + 1),
                    value: expandCborRawValue(ctx, v, depth + 1)
                });
            }
            return { _type: 'map', entries };
        }

        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = expandCborRawValue(ctx, v, depth + 1);
        }
        return out;
    }

    return value;
}

function renderRawValueAtDepthLimit(ctx: DecodeContext, value: unknown): unknown {
    if (value instanceof (cbor as any).Tagged) {
        const tag = (value as any).tag;
        const inner = (value as any).value;
        return {
            _cborTag: tag,
            value: renderRawValueAtDepthLimit(ctx, inner)
        };
    }

    const buffer = toBuffer(value);
    if (buffer) {
        return formatBytesPreview(ctx, buffer);
    }

    if (Array.isArray(value)) {
        if (isByteArray(value) && value.length > HEX_PREVIEW_BYTES) {
            return formatBytesPreview(ctx, Buffer.from(value));
        }
        return value.map(v => renderRawValueAtDepthLimit(ctx, v));
    }

    if (value instanceof Map) {
        const entries: Array<{ key: unknown; value: unknown }> = [];
        for (const [k, v] of value.entries()) {
            entries.push({
                key: renderRawValueAtDepthLimit(ctx, k),
                value: renderRawValueAtDepthLimit(ctx, v)
            });
        }
        return { _type: 'map', entries };
    }

    if (value !== null && typeof value === 'object') {
        const map = asCborMap(value);
        if (map && !(value instanceof Map)) {
            const entries: Array<{ key: unknown; value: unknown }> = [];
            for (const [k, v] of map.entries()) {
                entries.push({
                    key: renderRawValueAtDepthLimit(ctx, k),
                    value: renderRawValueAtDepthLimit(ctx, v)
                });
            }
            return { _type: 'map', entries };
        }

        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = renderRawValueAtDepthLimit(ctx, v);
        }
        return out;
    }

    return value;
}

function renderValueAtDepthLimit(ctx: DecodeContext, value: unknown): unknown {
    if (value instanceof (cbor as any).Tagged) {
        const tag = (value as any).tag;
        const inner = (value as any).value;
        return {
            _cborTag: tag,
            value: renderValueAtDepthLimit(ctx, inner)
        };
    }

    const buffer = toBuffer(value);
    if (buffer) {
        return formatBytesPreview(ctx, buffer);
    }

    if (Array.isArray(value)) {
        return value.map(v => renderValueAtDepthLimit(ctx, v));
    }

    if (value instanceof Map) {
        const result: Record<string, unknown> = {};
        for (const [k, v] of value.entries()) {
            result[mapKeyToString(k)] = renderValueAtDepthLimit(ctx, v);
        }
        return result;
    }

    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = renderValueAtDepthLimit(ctx, v);
        }
        return out;
    }

    return value;
}

function tryDecodeEmbeddedCborOrCose(ctx: DecodeContext, bytes: Buffer, depth: number): unknown | undefined {
    if (depth >= MAX_EMBEDDED_DECODE_DEPTH) {
        return undefined;
    }

    try {
        // Require the embedded bytes to decode cleanly as exactly one CBOR item.
        const items = cbor.decodeAllSync(bytes);
        if (!items || items.length !== 1) {
            return undefined;
        }

        const top = items[0];
        const candidate = unwrapCoseTag(top);
        if (isLikelyCoseSign1(candidate)) {
            return inspectCoseSign1(ctx, candidate, bytes.length);
        }

        return expandCborValue(ctx, top, depth + 1);
    } catch {
        return undefined;
    }
}

function isLikelyCoseSign1(decoded: unknown): decoded is unknown[] {
    if (!Array.isArray(decoded) || decoded.length !== 4) {
        return false;
    }

    // COSE_Sign1 has [bstr, map, bstr/nil, bstr]
    const protectedBytes = toBuffer(decoded[0]);
    const signatureBytes = toBuffer(decoded[3]);
    if (!protectedBytes || !signatureBytes) {
        return false;
    }

    const unprotectedMap = asCborMap(decoded[1]);
    if (!unprotectedMap) {
        return false;
    }

    const payload = decoded[2];
    if (!(payload === null || payload === undefined || toBuffer(payload))) {
        return false;
    }

    return true;
}

function decodeProtectedHeaders(protectedBytes: Buffer | null): Map<unknown, unknown> {
    if (!protectedBytes || protectedBytes.length === 0) {
        return new Map();
    }

    try {
        const decoded = cbor.decodeFirstSync(protectedBytes);
        return asCborMap(decoded) ?? new Map();
    } catch {
        // If protected headers cannot be decoded, treat as empty map.
        return new Map();
    }
}

function buildProtectedHeadersInfo(ctx: DecodeContext, headers: Map<unknown, unknown>): ProtectedHeadersInfo {
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

    // x5t (34): [hashAlgId, bstr]
    const x5t = headers.get(34);
    if (Array.isArray(x5t) && x5t.length === 2) {
        const hashAlgId = toInt32(x5t[0]);
        const thumbBytes = toBuffer(x5t[1]);
        if (hashAlgId !== null && thumbBytes) {
            info.certificateThumbprint = {
                algorithm: getHashAlgorithmName(hashAlgId),
                value: thumbBytes.toString('hex').toUpperCase()
            };
        }
    }

    // x5chain (33): bstr or array of bstr
    const x5chain = headers.get(33);
    const chainLength = getCertificateChainLength(x5chain);
    if (chainLength !== null) {
        info.certificateChainLength = chainLength;
    }

    // payload-hash-alg (258)
    const payloadHashAlg = headers.get(258);
    const payloadHashAlgId = toInt32(payloadHashAlg);
    if (payloadHashAlgId !== null) {
        info.payloadHashAlgorithm = { id: payloadHashAlgId, name: getHashAlgorithmName(payloadHashAlgId) };
    }

    // preimage-content-type (259)
    const preimageContentType = headers.get(259);
    if (typeof preimageContentType === 'string') {
        info.preimageContentType = preimageContentType;
    }

    // payload-location (260)
    const payloadLocation = headers.get(260);
    if (typeof payloadLocation === 'string') {
        info.payloadLocation = payloadLocation;
    }

    const otherHeaders: HeaderInfo[] = [];
    for (const [key, value] of headers.entries()) {
        const labelId = toInt32(key);
        if (
            labelId === 1 ||
            labelId === 2 ||
            labelId === 3 ||
            labelId === 15 ||
            labelId === 33 ||
            labelId === 34 ||
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

function buildUnprotectedHeaders(ctx: DecodeContext, headers: Map<unknown, unknown> | null): HeaderInfo[] | undefined {
    if (!headers || headers.size === 0) {
        return undefined;
    }

    const result: HeaderInfo[] = [];
    for (const [key, value] of headers.entries()) {
        result.push(buildHeaderInfo(ctx, key, value));
    }
    return result;
}

function buildHeaderInfo(ctx: DecodeContext, label: unknown, value: unknown): HeaderInfo {
    const labelId = toInt32(label);
    const info: HeaderInfo = {
        label: getHeaderName(labelId),
        lengthBytes: getEncodedLengthBytes(value)
    };

    // Match CoseSignTool behavior: labelId is only set for well-known labels.
    if (labelId !== null && isWellKnownHeaderLabel(labelId)) {
        info.labelId = labelId;
    }

    const meta = getValueTypeAndMetadata(value);
    info.valueType = meta.valueType;

    if (meta.valueType === 'bytes') {
        info.lengthBytes = meta.lengthBytes;
        // Avoid dumping certificate blobs; certificates are surfaced via `certificates`.
        if (labelId === 33) {
            return info;
        }

        // If the byte string is itself an encoded CBOR/COSE blob, decode it.
        const b = toBuffer(value);
        if (b) {
            const decoded = tryDecodeEmbeddedCborOrCose(ctx, b, 0);
            if (decoded !== undefined) {
                info.value = decoded;
            } else {
                // Provide a compact preview + blob handle for opening in hex.
                info.value = formatBytesPreview(ctx, b);
            }
        }
        return info;
    }

    if (meta.valueType === 'array' || meta.valueType === 'map') {
        info.lengthBytes = meta.lengthBytes;
        // Avoid dumping certificate blobs; certificates are surfaced via `certificates`.
        if (labelId === 33) {
            return info;
        }

        info.value = expandCborValue(ctx, value, 0);
        return info;
    }

    if (meta.value !== undefined) {
        info.value = meta.value;
    }

    return info;
}

function buildCwtClaimsInfo(ctx: DecodeContext, headers: Map<unknown, unknown>): CwtClaimsInfo | undefined {
    const cwt = headers.get(15);
    const cwtMap = asCborMap(cwt);
    if (!cwtMap || cwtMap.size === 0) {
        return undefined;
    }

    const info: CwtClaimsInfo = {};

    const iss = cwtMap.get(1);
    if (typeof iss === 'string' && iss.length > 0) {
        info.issuer = iss;
    }

    const sub = cwtMap.get(2);
    if (typeof sub === 'string' && sub.length > 0) {
        info.subject = sub;
    }

    const aud = cwtMap.get(3);
    if (typeof aud === 'string' && aud.length > 0) {
        info.audience = aud;
    }

    const iat = toUnixSeconds(cwtMap.get(6));
    if (iat !== null) {
        info.issuedAtUnix = iat;
        info.issuedAt = formatUnixSecondsUtc(iat);
    }

    const nbf = toUnixSeconds(cwtMap.get(5));
    if (nbf !== null) {
        info.notBeforeUnix = nbf;
        info.notBefore = formatUnixSecondsUtc(nbf);
    }

    const exp = toUnixSeconds(cwtMap.get(4));
    if (exp !== null) {
        info.expirationTimeUnix = exp;
        info.expirationTime = formatUnixSecondsUtc(exp);
        info.isExpired = exp < Math.floor(Date.now() / 1000);
    }

    const cti = toBuffer(cwtMap.get(7));
    if (cti && cti.length > 0) {
        info.cwtId = cti.toString('hex').toUpperCase();
    }

    const knownKeys = new Set([1, 2, 3, 4, 5, 6, 7]);

    const customClaims: ClaimInfo[] = [];
    for (const [k, v] of cwtMap.entries()) {
        const id = toInt32(k);
        if (id !== null && knownKeys.has(id)) {
            continue;
        }

        const meta = getValueTypeAndMetadata(v);
        const claim: ClaimInfo = {
            labelId: id ?? undefined,
            label: getCwtClaimName(id),
            valueType: meta.valueType
        };

        // Provide a JSON-friendly, fully-expanded value for custom claims.
        // (Unlike COSE header `HeaderInfo`, custom claims are already decoded values.)
        if (meta.valueType === 'bytes') {
            claim.lengthBytes = meta.lengthBytes;
            const b = toBuffer(v);
            if (b) {
                claim.value = tryDecodeEmbeddedCborOrCose(ctx, b, 0) ?? formatBytesPreview(ctx, b);
            } else {
                claim.value = convertBuffersToHex(v);
            }
        } else if (meta.valueType === 'array' || meta.valueType === 'map') {
            claim.lengthBytes = meta.lengthBytes;
            claim.value = expandCborValue(ctx, v, 0);
        } else if (meta.value !== undefined) {
            claim.value = expandCborValue(ctx, meta.value, 0);
        } else {
            claim.value = expandCborValue(ctx, v, 0);
        }

        customClaims.push(claim);
    }

    if (customClaims.length > 0) {
        info.customClaimsCount = customClaims.length;
        info.customClaims = customClaims;
    }

    return Object.keys(info).length > 0 ? info : undefined;
}

const WELL_KNOWN_CWT_CLAIMS: Record<number, string> = {
    1: 'iss (Issuer)',
    2: 'sub (Subject)',
    3: 'aud (Audience)',
    4: 'exp (Expiration)',
    5: 'nbf (Not Before)',
    6: 'iat (Issued At)',
    7: 'cti (CWT ID)'
};

function getCwtClaimName(labelId: number | null): string {
    if (labelId === null) {
        return 'CWT Claim (custom)';
    }
    return WELL_KNOWN_CWT_CLAIMS[labelId] ?? 'CWT Claim (custom)';
}

function buildPayloadInfo(ctx: DecodeContext, payload: unknown, contentType?: string): PayloadInfo {
    const payloadBytes = toBuffer(payload);
    const isEmbedded = !!(payloadBytes && payloadBytes.length > 0);

    const info: PayloadInfo = {
        isEmbedded
    };

    if (contentType) {
        info.contentType = contentType;
    }

    if (!isEmbedded || !payloadBytes) {
        return info;
    }

    info.sizeBytes = payloadBytes.length;
    info.isText = isLikelyText(payloadBytes);

    // Always register payload bytes so the UI can open them in Hex/Text.
    const payloadBlobId = registerBlob(ctx, payloadBytes);
    info.bytes = formatBytesPreview(ctx, payloadBytes, payloadBlobId);

    if (info.isText) {
        const previewBytes = payloadBytes.subarray(0, Math.min(100, payloadBytes.length));
        let preview = previewBytes.toString('utf8');
        if (payloadBytes.length > 100) {
            preview += '...';
        }
        // Tokenize so the webview can linkify the preview without showing blob IDs.
        if (info.bytes) {
            info.bytes.textPreview = `${PAYLOAD_PREVIEW_TOKEN}${payloadBlobId}|${preview}`;
        }
    } else {
        info.sha256 = createHash('sha256').update(payloadBytes).digest('hex').toUpperCase();

        // If the payload itself is an embedded CBOR/COSE blob, decode it.
        // Keep a conservative size cap to avoid freezing the editor.
        if (payloadBytes.length <= 1024 * 1024) {
            const decoded = tryDecodeEmbeddedCborOrCose(ctx, payloadBytes, 0);
            if (decoded !== undefined) {
                info.decoded = decoded;
            }
        }
    }

    return info;
}

function buildSignatureInfo(
    protectedHeaders: Map<unknown, unknown>,
    unprotectedHeaders: Map<unknown, unknown> | null,
    totalSizeBytes: number
): SignatureInfo {
    const info: SignatureInfo = {
        totalSizeBytes
    };

    if (unprotectedHeaders?.has(33)) {
        info.certificateChainLocation = 'unprotected';
    } else if (protectedHeaders.has(33)) {
        info.certificateChainLocation = 'protected';
    }

    return info;
}

function buildCertificateInfo(
    protectedHeaders: Map<unknown, unknown>,
    unprotectedHeaders: Map<unknown, unknown> | null
): CertificateInfo[] | undefined {
    const chain = protectedHeaders.get(33) ?? unprotectedHeaders?.get(33);
    const certs = extractCertificateChainBytes(chain);
    if (!certs || certs.length === 0) {
        return undefined;
    }

    const results: CertificateInfo[] = [];
    for (const certBytes of certs) {
        try {
            const cert = new X509Certificate(certBytes);

            const notBefore = tryFormatUtc(cert.validFrom);
            const notAfter = tryFormatUtc(cert.validTo);

            const thumbprint = (cert.fingerprint ?? '')
                .replaceAll(':', '')
                .toUpperCase();

            const keyAlgorithm = (cert.publicKey as any)?.asymmetricKeyType;
            const signatureAlgorithm = (cert as any).signatureAlgorithm;

            const isExpired = (() => {
                const parsed = Date.parse(cert.validTo);
                return Number.isFinite(parsed) ? parsed < Date.now() : undefined;
            })();

            results.push({
                subject: cert.subject,
                issuer: cert.issuer,
                serialNumber: cert.serialNumber,
                thumbprint: thumbprint.length > 0 ? thumbprint : undefined,
                notBefore,
                notAfter,
                isExpired,
                keyAlgorithm: typeof keyAlgorithm === 'string' ? keyAlgorithm : undefined,
                signatureAlgorithm: typeof signatureAlgorithm === 'string' ? signatureAlgorithm : undefined
            });
        } catch {
            // Skip malformed certificates
        }
    }

    return results.length > 0 ? results : undefined;
}

function extractCertificateChainBytes(value: unknown): Buffer[] | null {
    const direct = toBuffer(value);
    if (direct) {
        return [direct];
    }

    if (Array.isArray(value)) {
        const certs: Buffer[] = [];
        for (const item of value) {
            const b = toBuffer(item);
            if (b) {
                certs.push(b);
            }
        }
        return certs.length > 0 ? certs : null;
    }

    return null;
}

function getCertificateChainLength(value: unknown): number | null {
    if (Array.isArray(value)) {
        return value.length;
    }
    if (toBuffer(value)) {
        return 1;
    }
    return null;
}

function getAlgorithmName(algorithm: number): string {
    switch (algorithm) {
        // ECDSA algorithms
        case -7:
            return 'ES256 (ECDSA w/ SHA-256)';
        case -35:
            return 'ES384 (ECDSA w/ SHA-384)';
        case -36:
            return 'ES512 (ECDSA w/ SHA-512)';
        // RSA-PSS algorithms
        case -37:
            return 'PS256 (RSASSA-PSS w/ SHA-256)';
        case -38:
            return 'PS384 (RSASSA-PSS w/ SHA-384)';
        case -39:
            return 'PS512 (RSASSA-PSS w/ SHA-512)';
        // RSA PKCS#1 algorithms
        case -257:
            return 'RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)';
        case -258:
            return 'RS384 (RSASSA-PKCS1-v1_5 w/ SHA-384)';
        case -259:
            return 'RS512 (RSASSA-PKCS1-v1_5 w/ SHA-512)';
        // Hash algorithms (for payload-hash-alg)
        case -16:
            return 'SHA-256';
        case -43:
            return 'SHA-384';
        case -44:
            return 'SHA-512';
        default:
            return 'Unknown';
    }
}

function getHashAlgorithmName(algorithm: number): string {
    switch (algorithm) {
        case -16:
            return 'SHA-256';
        case -43:
            return 'SHA-384';
        case -44:
            return 'SHA-512';
        default:
            return `Unknown (${algorithm})`;
    }
}

const WELL_KNOWN_HEADERS: Record<number, string> = {
    1: 'alg (Algorithm)',
    2: 'crit (Critical)',
    3: 'content type',
    4: 'kid (Key ID)',
    5: 'IV',
    6: 'Partial IV',
    7: 'counter signature',
    15: 'CWT Claims',
    33: 'x5chain (Certificate Chain)',
    34: 'x5t (Certificate Thumbprint)',
    35: 'x5u (Certificate URL)',
    258: 'payload-hash-alg (Hash Algorithm)',
    259: 'payload-preimage-content-type',
    260: 'payload-location',
    393: 'scitt-receipts',
    394: 'scitt-statement'
};

function isWellKnownHeaderLabel(labelId: number): boolean {
    return Object.prototype.hasOwnProperty.call(WELL_KNOWN_HEADERS, labelId);
}

function getHeaderName(labelId: number | null): string {
    if (labelId === null) {
        return 'Header (custom)';
    }
    return WELL_KNOWN_HEADERS[labelId] ?? 'Header (custom)';
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

    if (typeof value === 'boolean') {
        return { valueType: 'bool', value };
    }

    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return value >= 0 ? { valueType: 'uint', value } : { valueType: 'int', value };
        }
        return { valueType: 'unknown', value };
    }

    if (typeof value === 'bigint') {
        const asString = value.toString();
        return value >= 0n ? { valueType: 'uint', value: asString } : { valueType: 'int', value: asString };
    }

    const buffer = toBuffer(value);
    if (buffer) {
        return { valueType: 'bytes', lengthBytes: buffer.length };
    }

    if (Array.isArray(value)) {
        return { valueType: 'array', lengthBytes: value.length };
    }

    const map = asCborMap(value);
    if (map) {
        return { valueType: 'map', lengthBytes: map.size };
    }

    return { valueType: 'unknown' };
}

function asCborMap(value: unknown): Map<unknown, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    if (value instanceof Map) {
        return value;
    }

    // Some CBOR decoders may return plain objects for maps with string keys.
    if (!Array.isArray(value) && !(value instanceof Date) && !(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
        const obj = value as Record<string, unknown>;
        const map = new Map<unknown, unknown>();
        for (const [k, v] of Object.entries(obj)) {
            map.set(k, v);
        }
        return map;
    }

    return null;
}

function toBuffer(value: unknown): Buffer | null {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value);
    }
    return null;
}

function toInt32(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
        return value;
    }

    if (typeof value === 'bigint' && value >= BigInt(-2147483648) && value <= BigInt(2147483647)) {
        return Number(value);
    }

    if (typeof value === 'string') {
        const n = Number(value);
        if (Number.isInteger(n) && n >= -2147483648 && n <= 2147483647) {
            return n;
        }
    }

    return null;
}

function toUnixSeconds(value: unknown): number | null {
    const n = toInt32(value);
    return n === null ? null : n;
}

function formatUnixSecondsUtc(unixSeconds: number): string {
    const d = new Date(unixSeconds * 1000);
    return formatDateUtc(d);
}

function tryFormatUtc(dateString: string): string | undefined {
    const ms = Date.parse(dateString);
    if (!Number.isFinite(ms)) {
        return undefined;
    }
    return formatDateUtc(new Date(ms));
}

function formatDateUtc(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
}

function isLikelyText(data: Buffer): boolean {
    if (data.length === 0) {
        return false;
    }

    const sample = data.subarray(0, Math.min(1000, data.length));
    let printableCount = 0;
    for (const b of sample) {
        if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
            printableCount++;
        }
    }

    return printableCount > sample.length * 0.8;
}

/**
 * Convert Buffer to hex string
 */
function bufferToHex(buffer: Buffer): string {
    return buffer.toString('hex');
}

/**
 * Recursively convert all Buffer objects to hex strings
 */
function convertBuffersToHex(obj: unknown): string | Record<string, unknown> | unknown[] | unknown {
    if (Buffer.isBuffer(obj)) {
        return bufferToHex(obj);
    } else if (obj instanceof Map) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of obj.entries()) {
            result[mapKeyToString(key)] = convertBuffersToHex(value);
        }
        return result;
    } else if (Array.isArray(obj)) {
        return obj.map(item => convertBuffersToHex(item));
    } else if (obj !== null && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = convertBuffersToHex((obj as Record<string, unknown>)[key]);
            }
        }
        return result;
    }
    return obj;
}

function mapKeyToString(key: unknown): string {
    if (typeof key === 'string') {
        return key;
    }
    if (typeof key === 'number' || typeof key === 'bigint' || typeof key === 'boolean') {
        return String(key);
    }
    const asBuf = toBuffer(key);
    if (asBuf) {
        return asBuf.toString('hex');
    }
    try {
        return JSON.stringify(convertBuffersToHex(key));
    } catch {
        return String(key);
    }
}
