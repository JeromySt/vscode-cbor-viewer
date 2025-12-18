import type { PrettyDecodeContext } from '../context';
import { registerBlob } from '../context';
import type { PreviewHints } from '../previewHints';
import type { BytesPreview } from '../core/bytesTypes';

/**
 * Creates a JSON-safe bytes preview model and registers a blob for later viewing.
 *
 * The returned object intentionally contains `_hexBlobId` (for unit tests and internal
 * wiring) plus `_previewHints` (for sanitization/linkification in the webview).
 */
export function createBytesPreview(ctx: PrettyDecodeContext, bytes: Buffer, existingBlobId?: string): BytesPreview {
    const blobId = existingBlobId ?? registerBlob(ctx, bytes);

    const hints: PreviewHints = {
        hexPreview: { kind: 'hex', blobId },
        // Text preview is optional; when present, it should open the same bytes as text.
        textPreview: { kind: 'text', blobId }
    };

    return {
        _type: 'bytes',
        lengthBytes: bytes.length,
        _hexBlobId: blobId,
        _previewHints: hints
    };
}
