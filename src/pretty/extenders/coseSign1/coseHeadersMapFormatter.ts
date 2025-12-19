import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CoseHeaders, HeaderInfo } from './coseSign1InspectionTypes';
import { toInt32 } from '../../core/numeric';
import { buildCoseHeadersMap, mergeHeaderContributions } from './coseHeaders';

export const CoseHeadersMapFormatter: PrettyFormatter = {
    id: 'cose-headers-map',
    // Must run before cwt-claims (150), otherwise COSE header maps get misclassified.
    order: 120,
    canFormat(value: unknown): boolean {
        if (!(value instanceof Map)) {
            return false;
        }
        return looksLikeCoseHeaderMap(value);
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        if (!(value instanceof Map)) {
            return undefined;
        }

        const headers = buildCoseHeadersMap(ctx, value);

        // Apply the same header projections as COSE_Sign1 does (alg, hash msg, certs).
        const coseAlgExt = ctx.format({ _type: 'cose-alg', protectedHeaders: value }, ctx.depth + 1) as any;
        const coseHashMsgExt = ctx.format({ _type: 'cose-hash-message', protectedHeaders: value }, ctx.depth + 1) as any;
        const certificateExt = ctx.format({ _type: 'cose-certificates', protectedHeaders: value }, ctx.depth + 1) as any;

        applyContrib(headers, coseAlgExt);
        applyContrib(headers, coseHashMsgExt);
        applyContrib(headers, certificateExt);

        return headers;
    }
};

function applyContrib(headers: CoseHeaders, ext: any): void {
    if (!ext || typeof ext !== 'object') {
        return;
    }
    if (ext.protectedHeaders && typeof ext.protectedHeaders === 'object') {
        mergeHeaderContributions(headers, ext.protectedHeaders as Record<string, Partial<HeaderInfo>>);
    }
}

function looksLikeCoseHeaderMap(map: Map<unknown, unknown>): boolean {
    if (map.size === 0) {
        return false;
    }

    // Strong signals: known COSE-only/rare-in-CWT ids.
    for (const k of map.keys()) {
        const id = toInt32(k);
        if (id === 32 || id === 33 || id === 34 || id === 35 || id === 258 || id === 259 || id === 260) {
            return true;
        }
    }

    // Common signal: alg (1) is usually an int id (often negative). If it's int-ish, treat as COSE.
    if (map.has(1)) {
        const algId = toInt32(map.get(1));
        if (algId !== null) {
            return true;
        }
    }

    return false;
}
