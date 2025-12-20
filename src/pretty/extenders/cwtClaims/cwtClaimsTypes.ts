/**
 * @fileoverview Cwt Claims Types (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { ValueType } from '../../core/valueTypes';

export interface CwtClaimsInfo {
    issuer?: string;
    subject?: string;
    audience?: string;
    issuedAt?: string;
    issuedAtUnix?: number;
    notBefore?: string;
    notBeforeUnix?: number;
    expirationTime?: string;
    expirationTimeUnix?: number;
    isExpired?: boolean;
    cwtId?: string;
    /** Additional (non-registered) CWT claims keyed by their numeric label (e.g. "999"). */
    customClaims?: Record<string, CwtClaimValue>;
}

export interface CwtClaimValue {
    /** Optional label text, when known (extender-provided via label registry). */
    label?: string;
    value?: unknown;
    valueType?: ValueType;
}
