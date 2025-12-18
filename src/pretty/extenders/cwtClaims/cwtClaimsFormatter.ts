import * as cbor from 'cbor';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { ClaimInfo, CwtClaimsInfo } from './cwtClaimsTypes';
import { asCborMap, toBuffer } from '../../util';
import { toInt32 } from '../../core/numeric';

/**
 * Formats a CWT claims map (RFC 8392) into a structured, JSON-safe model.
 *
 * This is intentionally a standalone formatter so other formatters (e.g. COSE_Sign1)
 * can delegate claim processing via `ctx.format(...)`.
 */
export const CwtClaimsFormatter: PrettyFormatter = {
    id: 'cwt-claims',
    order: 150,
    canFormat(value: unknown): boolean {
        const map = asCborMap(value);
        if (!map || map.size === 0) {
            return false;
        }

        // Heuristic: CWT claims are numeric labels (int) and commonly include at least
        // one well-known label id in 1..7.
        let knownCount = 0;
        for (const k of map.keys()) {
            const id = toInt32(k);
            if (id === null) {
                return false;
            }
            if (id >= 1 && id <= 7) {
                knownCount++;
            }
        }
        return knownCount > 0;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const map = asCborMap(value);
        if (!map || map.size === 0) {
            return undefined;
        }

        const info: CwtClaimsInfo = {};
        const custom: ClaimInfo[] = [];

        for (const [k, v] of map.entries()) {
            const id = toInt32(k);
            switch (id) {
                case 1:
                    if (typeof v === 'string') {
                        info.issuer = v;
                    }
                    break;
                case 2:
                    if (typeof v === 'string') {
                        info.subject = v;
                    }
                    break;
                case 3:
                    if (typeof v === 'string') {
                        info.audience = v;
                    }
                    break;
                case 4:
                    addTimeClaim(info, 'expirationTime', v);
                    break;
                case 5:
                    addTimeClaim(info, 'notBefore', v);
                    break;
                case 6:
                    addTimeClaim(info, 'issuedAt', v);
                    break;
                case 7:
                    {
                        const b = toBuffer(v);
                        if (b) {
                            info.cwtId = b.toString('hex').toUpperCase();
                        }
                    }
                    break;
                default:
                    custom.push(buildClaimInfo(ctx, k, v));
            }
        }

        if (typeof info.expirationTimeUnix === 'number') {
            info.isExpired = info.expirationTimeUnix * 1000 < Date.now();
        }

        if (custom.length > 0) {
            info.customClaims = custom;
            info.customClaimsCount = custom.length;
        }

        if (Object.keys(info).length === 0) {
            return undefined;
        }

        return info;
    }
};

function addTimeClaim(info: CwtClaimsInfo, field: 'issuedAt' | 'notBefore' | 'expirationTime', v: unknown): void {
    const n = toInt32(v);
    if (n === null) {
        return;
    }

    const d = new Date(n * 1000);
    const iso = d.toISOString();

    if (field === 'issuedAt') {
        info.issuedAtUnix = n;
        info.issuedAt = iso;
    } else if (field === 'notBefore') {
        info.notBeforeUnix = n;
        info.notBefore = iso;
    } else {
        info.expirationTimeUnix = n;
        info.expirationTime = iso;
    }
}

function getEncodedLengthBytes(value: unknown): number | undefined {
    try {
        const encoded = cbor.encodeOne(value as any);
        return Buffer.isBuffer(encoded) ? encoded.length : Buffer.from(encoded).length;
    } catch {
        return undefined;
    }
}

function getValueTypeAndMetadata(
    value: unknown
): { valueType: ClaimInfo['valueType']; value?: unknown; lengthBytes?: number } {
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

function buildClaimInfo(ctx: PrettyFormatterContext, label: unknown, value: unknown): ClaimInfo {
    const labelId = toInt32(label);
    const info: ClaimInfo = {
        label: ctx.labels.getCwtClaimName(labelId),
        lengthBytes: getEncodedLengthBytes(value)
    };

    if (labelId !== null) {
        info.labelId = labelId;
    }

    const meta = getValueTypeAndMetadata(value);
    info.valueType = meta.valueType;
    info.lengthBytes = meta.lengthBytes;

    if (meta.valueType === 'bytes' || meta.valueType === 'array' || meta.valueType === 'map') {
        info.value = ctx.format(value, ctx.depth + 1);
        return info;
    }

    if (meta.value !== undefined) {
        info.value = meta.value;
    }

    return info;
}
