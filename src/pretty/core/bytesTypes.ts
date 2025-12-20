/**
 * @fileoverview Bytes Types (pretty core).
 *
 * - Shared primitives used across pretty formatting and extenders.
 * - Focus on small, well-tested helpers and types.
 */
import type { PreviewHints } from '../previewHints';

/**
 * Standard bytes representation used in both pretty and raw views.
 *
 * NOTE: `_hexBlobId` is intentionally part of the model so unit tests can
 * validate blob tracking; the webview sanitization step removes it.
 */
export interface BytesPreview {
    _type: 'bytes';
    lengthBytes: number;
    _hexBlobId: string;
    /** Optional hint map for tokenization/linkification in the webview. */
    _previewHints?: PreviewHints;
    /** Additional preview fields (e.g. hexPreview/textPreview) are generated via preview generators. */
    [key: string]: unknown;
}
