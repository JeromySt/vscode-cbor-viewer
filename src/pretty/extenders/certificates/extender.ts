/**
 * @fileoverview Extender (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseCertificatesFormatter } from './coseCertificatesFormatter';
import { registerCoseCertificateHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cose-certificates',
    register(registry, labels, _previews): void {
        registerCoseCertificateHeaderLabels(labels);
        registry.register(CoseCertificatesFormatter);
    }
};
