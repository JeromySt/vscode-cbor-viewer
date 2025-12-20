/**
 * @fileoverview Preview Hints (pretty pipeline).
 *
 * - Core pretty-formatting pipeline and infrastructure.
 * - Wires registries/extenders into a bounded, JSON-safe output shape.
 */
export type PreviewHintKind = string;

/**
 * A "preview hint" describes how a string field should be treated by the UI.
 *
 * The current webview implementation linkifies values by looking for
 * tokenized string prefixes (see `CborEditorProvider.sanitizeForWebview`).
 *
 * This hint model lets formatters declare preview intent without needing
 * to know how the webview renders or which tokens are used.
 */
export interface PreviewHint {
    kind: PreviewHintKind;
    /** The blob id to request via `openHexBlob` / `openTextBlob`. */
    blobId: string;
}

/**
 * Per-object mapping of fieldName -> hint.
 *
 * Example (bytes preview):
 * `{ hexPreview: {kind:'hex', blobId:'blob-1'}, textPreview:{kind:'text', blobId:'blob-1'} }`
 */
export type PreviewHints = Record<string, PreviewHint>;
