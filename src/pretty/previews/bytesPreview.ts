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
        hexPreview: { kind: 'hex', blobId }
    };

    // Only surface a text preview when the bytes are reasonably likely to be UTF-8-ish text.
    // This keeps the UI consistent with the previous behavior: binary payloads shouldn't
    // show `textPreview` at all.
    if (isLikelyText(bytes)) {
        hints.textPreview = { kind: 'text', blobId };
    }

    return {
        _type: 'bytes',
        lengthBytes: bytes.length,
        _hexBlobId: blobId,
        _previewHints: hints
    };
}

function isLikelyText(data: Buffer): boolean {
    if (data.length === 0) {
        return false;
    }

    const sample = data.subarray(0, Math.min(1000, data.length));
    let printableCount = 0;
    for (const b of sample) {
        if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
            printableCount++;
        }
    }
    return printableCount > sample.length * 0.8;
}
