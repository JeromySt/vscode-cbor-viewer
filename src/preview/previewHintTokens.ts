/**
 * @fileoverview Token prefixes used in string values sent to the webview.
 *
 * The extension host replaces internal blob references with strings of the form:
 *   `${TOKEN}${blobId}|${displayText}`
 *
 * The webview then linkifies these strings without needing access to privileged state.
 *
 * These tokens are intentionally stable (do not change lightly):
 * - the webview script has backward-compatible defaults,
 * - and older cached/serialized JSON may contain them.
 */
export const HEX_TOKEN = '___CBOR_HEX_LINK___';
export const PAYLOAD_TOKEN = '___CBOR_PAYLOAD_PREVIEW___';
