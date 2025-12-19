import * as cbor from 'cbor';
import { createPrettyDecodeContext, type PrettyDecodeContext } from './pretty/context';
import { buildPrettyView } from './pretty/prettyView';
import { createBytesPreview } from './pretty/previews/bytesPreview';
import { asCborMap, toBuffer } from './pretty/util';
import { createDefaultPrettyFormatterRegistry } from './pretty/defaultRegistry';
import { LabelRegistry } from './pretty/labels/labelRegistry';
import { registerBuiltInExtenders } from './pretty/extenders/loadBuiltInExtenders';
import { PreviewGeneratorRegistry } from './pretty/previews/previewGeneratorRegistry';

type DecodeContext = PrettyDecodeContext;

const MAX_EMBEDDED_DECODE_DEPTH = 6;
const HEX_PREVIEW_BYTES = 20;

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
export interface DecodeResult {
    value: unknown;
    blobs: Map<string, Buffer>;
}

export interface DecodeViewsResult {
    pretty: unknown;
    raw: unknown;
    blobs: Map<string, Buffer>;
}

export interface DecodeViewsOptions {
    /** Force the pretty view to interpret the root decoded value as a COSE headers map. */
    prettyRootType?: 'coseHeaders';
}

/**
 * Decode CBOR data to a JavaScript object.
 */
export function decodeCbor(data: Uint8Array): unknown {
    return decodeCborWithBlobs(data).value;
}

export function decodeCborWithBlobs(data: Uint8Array): DecodeResult {
    try {
        const buffer = Buffer.from(data);
        const decoded = cbor.decodeFirstSync(buffer);
        return decodeCborDecodedValueWithBlobs(decoded, buffer.length);
    } catch (error) {
        throw new Error(`Failed to decode CBOR data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function decodeCborWithViews(data: Uint8Array, options?: DecodeViewsOptions): DecodeViewsResult {
    try {
        const buffer = Buffer.from(data);
        const decoded = cbor.decodeFirstSync(buffer);
        return decodeCborDecodedValueWithViews(decoded, buffer.length, options);
    } catch (error) {
        throw new Error(`Failed to decode CBOR data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Post-process an already-decoded CBOR value into the viewer's output shape
 * while collecting any byte blobs for hex viewing.
 */
export function decodeCborDecodedValueWithBlobs(decoded: unknown, totalSizeBytes: number): DecodeResult {
    const views = decodeCborDecodedValueWithViews(decoded, totalSizeBytes);
    return { value: views.pretty, blobs: views.blobs };
}

export function decodeCborDecodedValueWithViews(decoded: unknown, totalSizeBytes: number, options?: DecodeViewsOptions): DecodeViewsResult {
    const ctx: PrettyDecodeContext = createPrettyDecodeContext();
    const prettyInput = (() => {
        if (options?.prettyRootType === 'coseHeaders') {
            const map = asCborMap(decoded) ?? (decoded instanceof Map ? decoded : null);
            if (map) {
                return { _type: 'cose-headers', headers: map };
            }
        }
        return decoded;
    })();

    const pretty = buildPrettyView(ctx, prettyInput, totalSizeBytes);
    const raw = expandCborRawValue(ctx, decoded, 0);

    // Raw view also uses bytes preview objects; materialize any preview fields from `_previewHints`.
    const registry = createDefaultPrettyFormatterRegistry();
    const labels = new LabelRegistry();
    const previews = new PreviewGeneratorRegistry();
    registerBuiltInExtenders(registry, labels, previews);
    previews.generatePreviewsInPlace(raw, ctx.blobs);

    return { pretty, raw, blobs: ctx.blobs };
}

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

        const buf = toBuffer(value);
        if (buf) {
            return createBytesPreview(ctx, buf);
        }

        if (Array.isArray(value)) {
            if (isByteArray(value) && value.length > HEX_PREVIEW_BYTES) {
                return createBytesPreview(ctx, Buffer.from(value));
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

        const buf = toBuffer(value);
        if (buf) {
            return createBytesPreview(ctx, buf);
        }

        if (Array.isArray(value)) {
            if (isByteArray(value) && value.length > HEX_PREVIEW_BYTES) {
                return createBytesPreview(ctx, Buffer.from(value));
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
