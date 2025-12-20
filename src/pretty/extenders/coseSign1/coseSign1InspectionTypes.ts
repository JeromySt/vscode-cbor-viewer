/**
 * @fileoverview Cose Sign1 Inspection Types (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { BytesPreview } from '../../core/bytesTypes';
import type { ValueType } from '../../core/valueTypes';

/**
 * Viewer inspection model for COSE_Sign1.
 *
 * This is intentionally NOT the RFC wire-structure type definition; it is a
 * contributor-extensible, JSON-safe model intended for display.
 */
export interface CoseInspectionResult {
    protectedHeaders?: CoseHeaders;
    /**
     * Unprotected header parameters keyed by their label id (e.g. "33").
     *
     * This mirrors protectedHeaders so the actual header label keys/values can be inspected.
     */
    unprotectedHeaders?: CoseHeaders;
    payload?: PayloadInfo;
    signature?: SignatureInfo;
}

/**
 * A COSE header map rendered as a JSON object.
 *
 * COSE header labels can be integers or text strings; the JSON keys here are the
 * actual COSE label, stringified when necessary.
 */
export type CoseHeaders = Record<string, HeaderInfo>;

export interface HeaderInfo {
    /** Optional label text, when known (extender-provided via label registry). */
    label?: string;
    value?: unknown;
    valueType?: ValueType;
}

export interface PayloadInfo {
    isEmbedded: boolean;
    sizeBytes?: number;
    contentType?: string;
    isText?: boolean;
    bytes?: BytesPreview;
    sha256?: string;
    decoded?: unknown;
}

export interface SignatureInfo {
    totalSizeBytes: number;
}
