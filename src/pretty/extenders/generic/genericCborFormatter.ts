import * as cbor from 'cbor';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import { mapKeyToString, toBuffer } from '../../util';

/**
 * Generic CBOR expansion fallback.
 *
 * This should be the last formatter to run (highest order). It implements the
 * baseline recursion policy and bytes preview handling.
 */
export const GenericCborFormatter: PrettyFormatter = {
    id: 'generic-cbor',
    order: 10_000,
    canFormat: () => true,
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        if (ctx.depth >= ctx.maxDepth) {
            return ctx.formatAtDepthLimit(value);
        }

        if (value instanceof (cbor as any).Tagged) {
            const tag = (value as any).tag;
            const inner = (value as any).value;
            return {
                _cborTag: tag,
                value: ctx.format(inner, ctx.depth + 1)
            };
        }

        const buffer = toBuffer(value);
        if (buffer) {
            const embedded = ctx.tryDecodeEmbedded(buffer, ctx.depth + 1);
            if (embedded !== undefined) {
                return ctx.format(embedded, ctx.depth + 1);
            }
            return ctx.bytesPreview(buffer);
        }

        if (Array.isArray(value)) {
            return value.map(v => ctx.format(v, ctx.depth + 1));
        }

        if (value instanceof Map) {
            const result: Record<string, unknown> = {};
            for (const [k, v] of value.entries()) {
                result[mapKeyToString(k)] = ctx.format(v, ctx.depth + 1);
            }
            return result;
        }

        if (value !== null && typeof value === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                out[k] = ctx.format(v, ctx.depth + 1);
            }
            return out;
        }

        return value;
    }
};
