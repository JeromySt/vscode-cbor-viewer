import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CoseHeaders, HeaderInfo } from './coseSign1InspectionTypes';
import { buildCoseHeadersMap, mergeHeaderContributions } from './coseHeaders';

type CoseHeadersExplicitInput = {
    _type: 'cose-headers';
    headers: Map<unknown, unknown>;
};

export const CoseHeadersExplicitFormatter: PrettyFormatter = {
    id: 'cose-headers-explicit',
    // Runs before the heuristic COSE header-map formatter and before CWT claims.
    order: 110,
    canFormat(value: unknown): boolean {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const v = value as Partial<CoseHeadersExplicitInput>;
        return v._type === 'cose-headers' && v.headers instanceof Map;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const v = value as CoseHeadersExplicitInput;
        const headers = buildCoseHeadersMap(ctx, v.headers);

        const coseAlgExt = ctx.format({ _type: 'cose-alg', protectedHeaders: v.headers }, ctx.depth + 1) as any;
        const coseHashMsgExt = ctx.format({ _type: 'cose-hash-message', protectedHeaders: v.headers }, ctx.depth + 1) as any;
        const certificateExt = ctx.format({ _type: 'cose-certificates', protectedHeaders: v.headers }, ctx.depth + 1) as any;

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
