/**
 * @fileoverview Context (pretty pipeline).
 *
 * - Core pretty-formatting pipeline and infrastructure.
 * - Wires registries/extenders into a bounded, JSON-safe output shape.
 */
/**
 * Mutable decode-time context shared across pretty formatting.
 *
 * Currently it holds only blob bookkeeping:
 * - `blobs`: raw bytes stored in the extension host
 * - `nextBlobId`: monotonic id generator
 *
 * Why this is a context instead of a global:
 * - Each decode should have isolated blob ids.
 * - It makes unit tests deterministic.
 * - It avoids leaking data across open documents.
 */
export interface PrettyDecodeContext {
    blobs: Map<string, Buffer>;
    nextBlobId: number;
}

/** Create a fresh decode context for one CBOR document/render operation. */
export function createPrettyDecodeContext(): PrettyDecodeContext {
    return {
        blobs: new Map<string, Buffer>(),
        nextBlobId: 1
    };
}

/**
 * Register a blob and return its stable id.
 *
 * The id becomes part of preview hint tokens used in the webview.
 * We keep ids human-readable primarily to aid debugging; they are still opaque from a security
 * perspective because they are scoped to the in-memory store.
 */
export function registerBlob(ctx: PrettyDecodeContext, bytes: Buffer): string {
    const id = `blob-${ctx.nextBlobId++}`;
    ctx.blobs.set(id, bytes);
    return id;
}
