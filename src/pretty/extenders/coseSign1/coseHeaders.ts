import type { HeaderInfo, CoseHeaders } from './coseSign1InspectionTypes';
import { toInt32 } from '../../core/numeric';
import { asCborMap, toBuffer } from '../../util';
import type { PrettyFormatterContext } from '../../registry';

export function buildCoseHeadersMap(ctx: PrettyFormatterContext, headers: Map<unknown, unknown> | null): CoseHeaders {
    const result: CoseHeaders = {};
    if (!headers || headers.size === 0) {
        return result;
    }

    for (const [key, value] of headers.entries()) {
        const labelId = toInt32(key);
        const headerInfo = buildHeaderInfo(ctx, key, value);

        let propertyKey: string;
        if (labelId !== null) {
            propertyKey = labelId.toString();
        } else if (typeof key === 'string' && key.length > 0) {
            propertyKey = key;
        } else {
            propertyKey = String(key);
        }

        if (Object.prototype.hasOwnProperty.call(result, propertyKey)) {
            propertyKey = `header:${propertyKey}`;
        }
        result[propertyKey] = headerInfo;
    }

    return result;
}

export function mergeHeaderContributions(headers: CoseHeaders, contributions: Record<string, Partial<HeaderInfo>>): void {
    for (const [key, patch] of Object.entries(contributions)) {
        const existing = headers[key];
        if (!existing || !patch || typeof patch !== 'object') {
            continue;
        }
        headers[key] = { ...existing, ...patch };
    }
}

function buildHeaderInfo(ctx: PrettyFormatterContext, label: unknown, value: unknown): HeaderInfo {
    const labelId = toInt32(label);
    const info: HeaderInfo = {};

    if (labelId !== null) {
        const labelText = ctx.labels.getCoseHeaderName(labelId);
        // prettyView's default for unknown COSE header ids.
        if (labelText && labelText !== 'Header (custom)') {
            info.label = labelText;
        }
    }

    const meta = getValueTypeAndMetadata(value);
    info.valueType = meta.valueType;

    // Avoid dumping certificate blobs; certificate details are surfaced via header value overrides.
    if (meta.valueType === 'bytes' || meta.valueType === 'array' || meta.valueType === 'map') {
        if (labelId === 32 || labelId === 33) {
            return info;
        }

        // CWT claims set (label 15): always format via the CWT claims formatter.
        // Some claim sets may not include well-known labels 1..7, so relying solely
        // on heuristic canFormat() would miss them.
        if (labelId === 15 && meta.valueType === 'map') {
            info.value = ctx.format({ _type: 'cwt-claims', claims: value }, ctx.depth + 1);
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

function getValueTypeAndMetadata(value: unknown): { valueType: HeaderInfo['valueType']; value?: unknown } {
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
