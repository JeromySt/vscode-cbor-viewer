import type { PrettyDecodeContext } from '../context';
import { registerBlob } from '../context';
import type { PreviewHints } from '../previewHints';
import type { BytesPreview } from '../core/bytesTypes';
import { isLikelyUtf8Text } from '../util';

/**
 * Creates a JSON-safe bytes preview model and registers a blob for later viewing.
 *
 * The returned object intentionally contains `_hexBlobId` (for unit tests and internal
 * wiring) plus `_previewHints` (for sanitization/linkification in the webview).
 */
export function createBytesPreview(ctx: PrettyDecodeContext, bytes: Buffer, existingBlobId?: string): BytesPreview {
    const blobId = existingBlobId ?? registerBlob(ctx, bytes);

    const hints: PreviewHints = {
        hexPreview: { kind: 'hex', blobId }
    };

    // Only surface a text preview when the bytes are reasonably likely to be UTF-8-ish text.
    // This keeps the UI consistent with the previous behavior: binary payloads shouldn't
    // show `textPreview` at all.
    if (isLikelyUtf8Text(bytes)) {
        hints.textPreview = { kind: 'text', blobId };
    }

    return {
        _type: 'bytes',
        lengthBytes: bytes.length,
        _hexBlobId: blobId,
        _previewHints: hints
    };
}
