import * as cbor from 'cbor';
import type { PrettyDecodeContext } from './context';
import { createDefaultPrettyFormatterRegistry } from './defaultRegistry';
import type { PrettyFormatterContext } from './registry';
import { mapKeyToString, toBuffer } from './util';
import { createBytesPreview } from './previews/bytesPreview';
import { LabelRegistry } from './labels/labelRegistry';
import { registerBuiltInExtenders } from './extenders/loadBuiltInExtenders';
import { PreviewGeneratorRegistry } from './previews/previewGeneratorRegistry';

const MAX_EMBEDDED_DECODE_DEPTH = 6;

export interface BuildPrettyViewOptions {
    maxDepth?: number;
}

/**
 * Entry point for building the "pretty" view.
 *
 * This function is intentionally small: it wires together the registry,
 * recursion behavior, embedded decode policy, and bytes preview creation.
 */
export function buildPrettyView(ctx: PrettyDecodeContext, decoded: unknown, totalSizeBytes: number, options?: BuildPrettyViewOptions): unknown {
    const registry = createDefaultPrettyFormatterRegistry();
    const maxDepth = options?.maxDepth ?? MAX_EMBEDDED_DECODE_DEPTH;

    // Label registry is a lightweight extension point: extenders can register
    // well-known numeric ids without touching core formatters.
    const labels = new LabelRegistry();
    // Preview generators are also registered by extenders.
    const previews = new PreviewGeneratorRegistry();
    registerBuiltInExtenders(registry, labels, previews);

    const formatAtDepthLimit = (value: unknown): unknown => {
        // Depth-limit behavior: still keep bytes compact, but do NOT attempt embedded decode.
        if (value instanceof (cbor as any).Tagged) {
            const tag = (value as any).tag;
            const inner = (value as any).value;
            return {
                _cborTag: tag,
                value: formatAtDepthLimit(inner)
            };
        }

        const b = toBuffer(value);
        if (b) {
            return createBytesPreview(ctx, b);
        }

        if (Array.isArray(value)) {
            return value.map(v => formatAtDepthLimit(v));
        }

        if (value instanceof Map) {
            const result: Record<string, unknown> = {};
            for (const [k, v] of value.entries()) {
                // Keep map key policy consistent with existing behavior.
                result[mapKeyToString(k)] = formatAtDepthLimit(v);
            }
            return result;
        }

        if (value !== null && typeof value === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                out[k] = formatAtDepthLimit(v);
            }
            return out;
        }

        return value;
    };

    const format = (value: unknown, depth = 0, localTotalSizeBytes?: number): unknown => {
        const formatterCtx: PrettyFormatterContext = {
            depth,
            maxDepth,
            totalSizeBytes: localTotalSizeBytes ?? totalSizeBytes,
            format: (v, d) => format(v, d ?? depth),
            formatAtDepthLimit: (v) => formatAtDepthLimit(v),
            tryDecodeEmbedded: (bytes, nextDepth) => tryDecodeEmbedded(bytes, nextDepth),
            bytesPreview: (bytes, existingBlobId) => createBytesPreview(ctx, bytes, existingBlobId),
            labels: {
                getCoseHeaderName(labelId: number | null): string {
                    if (labelId === null) {
                        return 'Header (custom)';
                    }
                    return labels.get('coseHeader', labelId) ?? 'Header (custom)';
                },
                getCwtClaimName(labelId: number | null): string {
                    if (labelId === null) {
                        return 'CWT Claim (custom)';
                    }
                    return labels.get('cwtClaim', labelId) ?? 'CWT Claim (custom)';
                }
            }
        };

        return registry.format(value, formatterCtx);
    };

    const tryDecodeEmbedded = (bytes: Buffer, nextDepth: number): unknown | undefined => {
        if (nextDepth >= maxDepth) {
            return undefined;
        }

        try {
            // Require the embedded bytes to decode cleanly as exactly one CBOR item.
            const items = cbor.decodeAllSync(bytes);
            if (!items || items.length !== 1) {
                return undefined;
            }
            return items[0];
        } catch {
            return undefined;
        }
    };

    const out = format(decoded, 0, totalSizeBytes);
    previews.generatePreviewsInPlace(out, ctx.blobs);
    return out;
}
