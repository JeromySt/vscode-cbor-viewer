/**
 * @fileoverview Cose Header Labels (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { LabelRegistry } from '../../labels/labelRegistry';

// COSE header parameter id for embedded CWT claims (claims map is its own RFC).
const COSE_CWT_CLAIMS_HEADER_ID = 15;

export function registerCoseCwtClaimsHeaderLabels(registry: LabelRegistry): void {
    registry.register('coseHeader', COSE_CWT_CLAIMS_HEADER_ID, 'CWT Claims');
}
