/**
 * @fileoverview Cwt Claims Formatter (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CwtClaimValue, CwtClaimsInfo } from './cwtClaimsTypes';
import { asCborMap, mapKeyToString, toBuffer } from '../../util';
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
        if (value && typeof value === 'object' && (value as any)._type === 'cwt-claims') {
            return true;
        }

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
        const map = (() => {
            if (value && typeof value === 'object' && (value as any)._type === 'cwt-claims') {
                return asCborMap((value as any).claims);
            }
            return asCborMap(value);
        })();
        if (!map || map.size === 0) {
            return undefined;
        }

        const info: CwtClaimsInfo = {};
        const custom: Record<string, CwtClaimValue> = {};
        let customCount = 0;

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
                    {
                        const labelId = toInt32(k);
                        const key = labelId !== null ? labelId.toString() : String(k);
                        if (Object.prototype.hasOwnProperty.call(custom, key)) {
                            continue;
                        }
                        custom[key] = buildClaimValue(ctx, labelId, v);
                        customCount++;
                    }
            }
        }

        if (typeof info.expirationTimeUnix === 'number') {
            info.isExpired = info.expirationTimeUnix * 1000 < Date.now();
        }

        if (customCount > 0) {
            info.customClaims = custom;
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

function getValueTypeAndMetadata(value: unknown): { valueType: CwtClaimValue['valueType']; value?: unknown } {
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
        return { valueType: 'bytes' };
    }

    if (Array.isArray(value)) {
        return { valueType: 'array' };
    }

    if (value instanceof Map) {
        return { valueType: 'map' };
    }

    if (typeof value === 'object') {
        const map = asCborMap(value);
        if (map && !(value instanceof Map)) {
            return { valueType: 'map' };
        }
        return { valueType: 'unknown', value };
    }

    return { valueType: 'unknown', value };
}

function buildClaimValue(ctx: PrettyFormatterContext, labelId: number | null, value: unknown): CwtClaimValue {
    const info: CwtClaimValue = {};

    if (labelId !== null) {
        const labelText = ctx.labels.getCwtClaimName(labelId);
        // prettyView's default for unknown CWT claim ids.
        if (labelText && labelText !== 'Claim (custom)') {
            info.label = labelText;
        }
    }

    const meta = getValueTypeAndMetadata(value);
    info.valueType = meta.valueType;

    if (meta.valueType === 'bytes' || meta.valueType === 'array' || meta.valueType === 'map') {
        // Most structured values (bytes/arrays/maps) are expanded via the formatter pipeline.
        //
        // Important edge case:
        // - A nested map might look like a CWT claims map (keys 1..7) and therefore be picked up
        //   by `CwtClaimsFormatter`.
        // - If that formatter determines it cannot produce any meaningful fields, it returns
        //   `undefined` and JSON serialization will omit the `value` property entirely.
        //
        // For *custom claims* this is surprising; users expect to at least see the structure.
        // So we fall back to a generic expansion that preserves the map/array shape.
        const expanded = ctx.format(value, ctx.depth + 1);
        if (expanded !== undefined) {
            info.value = expanded;
            return info;
        }

        if (meta.valueType === 'bytes') {
            const b = toBuffer(value);
            if (b) {
                info.value = ctx.bytesPreview(b);
            }
            return info;
        }

        if (meta.valueType === 'array' && Array.isArray(value)) {
            info.value = value.map(v => ctx.format(v, ctx.depth + 2));
            return info;
        }

        if (meta.valueType === 'map') {
            info.value = formatMapFallback(ctx, value);
            return info;
        }

        return info;
    }

    if (meta.value !== undefined) {
        info.value = meta.value;
    }

    return info;
}

function formatMapFallback(ctx: PrettyFormatterContext, value: unknown): Record<string, unknown> | undefined {
    if (ctx.depth + 1 >= ctx.maxDepth) {
        const limited = ctx.formatAtDepthLimit(value);
        if (limited && typeof limited === 'object' && !Array.isArray(limited)) {
            return limited as Record<string, unknown>;
        }
        return undefined;
    }

    const map = asCborMap(value);
    if (!map) {
        return undefined;
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of map.entries()) {
        out[mapKeyToString(k)] = ctx.format(v, ctx.depth + 2);
    }
    return out;
}
