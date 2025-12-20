/**
 * @fileoverview Extender (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseSign1Formatter } from './coseSign1Formatter';
import { CoseAlgorithmFormatter } from './coseAlgorithmFormatter';
import { CoseHeadersMapFormatter } from './coseHeadersMapFormatter';
import { CoseHeadersExplicitFormatter } from './coseHeadersExplicitFormatter';
import { registerCoseBaseHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cose-sign1',
    register(registry, labels, _previews): void {
        registerCoseBaseHeaderLabels(labels);
        registry.register(CoseSign1Formatter);
        registry.register(CoseAlgorithmFormatter);
        registry.register(CoseHeadersExplicitFormatter);
        registry.register(CoseHeadersMapFormatter);
    }
};
