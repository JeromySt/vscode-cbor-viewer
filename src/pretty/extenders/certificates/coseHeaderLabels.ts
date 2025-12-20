/**
 * @fileoverview Cose Header Labels (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { LabelRegistry } from '../../labels/labelRegistry';

// COSE X.509 / certificate-related header parameters.
const WELL_KNOWN_CERT_HEADERS: Record<number, string> = {
    32: 'x5bag (Certificate Bag)',
    33: 'x5chain (Certificate Chain)',
    34: 'x5t (Certificate Thumbprint)',
    35: 'x5u (Certificate URL)'
};

export function registerCoseCertificateHeaderLabels(registry: LabelRegistry): void {
    for (const [k, v] of Object.entries(WELL_KNOWN_CERT_HEADERS)) {
        registry.register('coseHeader', Number(k), v);
    }
}
