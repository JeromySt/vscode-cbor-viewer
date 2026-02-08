/**
 * @fileoverview CBOR decoding and view construction.
 *
 * This module produces two complementary “views” of a decoded CBOR value:
 * - **Pretty view**: a projection intended for humans (labels, COSE/CWT projections, etc.).
 * - **Raw view**: a mechanically faithful representation that preserves CBOR-specific structure
 *   (tags, maps) in a JSON-friendly shape.
 *
 * A key design goal is that both views can reference large byte strings without inlining
 * megabytes of data into the webview. Instead we materialize *bytes preview objects* and keep
 * the real bytes in a `blobs` map keyed by an opaque id.
 */

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

/**
 * Hard recursion cap for the raw view.
 *
 * Why this exists:
 * - Malicious or simply huge CBOR can be deeply nested.
 * - The webview is a UI surface; responsiveness matters.
 *
 * The pretty view has its own depth policy (see `buildPrettyView`).
 */
const MAX_EMBEDDED_DECODE_DEPTH = 6;

/**
 * Small byte arrays are reasonably readable inline.
 * Above this threshold we render a bytes preview object instead.
 */
const HEX_PREVIEW_BYTES = 20;

/**
 * Heuristic for “byte array encoded as JSON numbers”.
 *
 * Some CBOR sources decode into arrays of integers (0..255) rather than a `Buffer`/`Uint8Array`.
 * When the array is large, we treat it like a byte string for UX reasons.
 */
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
 * Decode a buffer as either a single CBOR data item or a CBOR Sequence (RFC 8742).
 *
 * A CBOR Sequence is zero or more concatenated CBOR data items.
 * - If the buffer contains exactly one item, return it directly (backward compatible).
 * - If it contains multiple items, return a `_type: 'cbor-sequence'` wrapper.
 * - If it is empty, throw (the viewer should show an informative error, not silent empty).
 */
function decodeAllOrFirst(buffer: Buffer): unknown {
    const items = cbor.decodeAllSync(buffer);
    if (items.length === 0) {
        throw new Error('Empty CBOR data: no data items found');
    }
    if (items.length === 1) {
        return items[0];
    }
    // Return as a CBOR Sequence marker so downstream rendering treats it appropriately.
    return { _type: 'cbor-sequence', items };
}

/**
 * Decode CBOR data to a JavaScript object.
 */
export function decodeCbor(data: Uint8Array): unknown {
    return decodeCborWithBlobs(data).value;
}

/**
 * Decode CBOR and also collect any extracted byte blobs.
 *
 * Blob collection enables:
 * - linkified hex/text previews in the webview,
 * - preview extenders that open derived buffers (e.g. “Decode as CBOR”).
 */
export function decodeCborWithBlobs(data: Uint8Array): DecodeResult {
    try {
        const buffer = Buffer.from(data);
        const decoded = decodeAllOrFirst(buffer);
        return decodeCborDecodedValueWithBlobs(decoded, buffer.length);
    } catch (error) {
        throw new Error(`Failed to decode CBOR data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function decodeCborWithViews(data: Uint8Array, options?: DecodeViewsOptions): DecodeViewsResult {
    try {
        const buffer = Buffer.from(data);
        const decoded = decodeAllOrFirst(buffer);
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

/**
 * Build both pretty + raw views from an *already decoded* CBOR value.
 *
 * This is used when the caller wants control over the decoding step (e.g. to cache the root
 * object for intentful actions like extracting COSE headers).
 */
export function decodeCborDecodedValueWithViews(decoded: unknown, totalSizeBytes: number, options?: DecodeViewsOptions): DecodeViewsResult {
    const ctx: PrettyDecodeContext = createPrettyDecodeContext();
    const prettyInput = (() => {
        if (options?.prettyRootType === 'coseHeaders') {
            // Intentionally “wrap” the decoded value so the pretty formatter registry can
            // interpret the root as a COSE headers map even when the CBOR document itself
            // isn't tagged/structured as COSE.
            const map = asCborMap(decoded) ?? (decoded instanceof Map ? decoded : null);
            if (map) {
                return { _type: 'cose-headers', headers: map };
            }
        }
        return decoded;
    })();

    const pretty = buildPrettyView(ctx, prettyInput, totalSizeBytes);

    // Handle CBOR Sequences (RFC 8742) in raw view: expand each element independently.
    let raw: unknown;
    if (decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        && (decoded as any)._type === 'cbor-sequence' && Array.isArray((decoded as any).items)) {
        const seqItems = (decoded as any).items as unknown[];
        raw = {
            _type: 'cbor-sequence',
            items: seqItems.map((item, i) => ({
                _sequenceIndex: i,
                value: expandCborRawValue(ctx, item, 0)
            }))
        };
    } else {
        raw = expandCborRawValue(ctx, decoded, 0);
    }

    // Raw view also uses bytes preview objects; materialize any preview fields from `_previewHints`.
    // This is a second pass because raw-view expansion doesn't consult the pretty formatter registry.
    const registry = createDefaultPrettyFormatterRegistry();
    const labels = new LabelRegistry();
    const previews = new PreviewGeneratorRegistry();
    registerBuiltInExtenders(registry, labels, previews);
    previews.generatePreviewsInPlace(raw, ctx.blobs);

    return { pretty, raw, blobs: ctx.blobs };
}

    /**
     * Convert a decoded CBOR value into a JSON-friendly representation.
     *
     * Raw view goals:
     * - Preserve CBOR shape (tags + maps) rather than prettifying.
     * - Keep bytes compact via bytes preview objects.
     * - Keep runtime bounded via a depth limit.
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

    /**
     * Depth-limit rendering: keep structure recognizable without trying to further expand
     * or decode embedded objects.
     */
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
