/**
 * @fileoverview Extender (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyExtender } from '../prettyExtender';
import { CwtClaimsFormatter } from './cwtClaimsFormatter';
import { registerCwtClaimLabels } from './cwtClaimsLabels';
import { registerCoseCwtClaimsHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cwt-claims',
    register(registry, labels, _previews): void {
        registerCwtClaimLabels(labels);
        registerCoseCwtClaimsHeaderLabels(labels);
        registry.register(CwtClaimsFormatter);
    }
};
