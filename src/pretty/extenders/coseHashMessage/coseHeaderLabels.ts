/**
 * @fileoverview Cose Header Labels (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { LabelRegistry } from '../../labels/labelRegistry';

// COSE Hash Message header parameters (RFC 9338).
const WELL_KNOWN_COSE_HASH_MESSAGE_HEADERS: Record<number, string> = {
    258: 'payload-hash-alg (Hash Algorithm)',
    259: 'payload-preimage-content-type',
    260: 'payload-location'
};

export function registerCoseHashMessageHeaderLabels(registry: LabelRegistry): void {
    for (const [k, v] of Object.entries(WELL_KNOWN_COSE_HASH_MESSAGE_HEADERS)) {
        registry.register('coseHeader', Number(k), v);
    }
}
