/**
 * @fileoverview Cose Header Labels (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { LabelRegistry } from '../../labels/labelRegistry';

// COSE base header parameters used by COSE_Sign1 (RFC 9052 / COSE header params).
// Extension-specific header ids are registered by their respective extenders.
const WELL_KNOWN_COSE_BASE_HEADERS: Record<number, string> = {
    1: 'alg (Algorithm)',
    2: 'crit (Critical)',
    3: 'content type',
    4: 'kid (Key ID)',
    5: 'IV',
    6: 'Partial IV',
    7: 'counter signature'
};

export function registerCoseBaseHeaderLabels(registry: LabelRegistry): void {
    for (const [k, v] of Object.entries(WELL_KNOWN_COSE_BASE_HEADERS)) {
        registry.register('coseHeader', Number(k), v);
    }
}
