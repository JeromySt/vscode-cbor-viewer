/**
 * @fileoverview Extender registration for CWT Tag 61 (RFC 8392).
 */
import type { PrettyExtender } from '../prettyExtender';
import { CwtTagFormatter } from './cwtTagFormatter';

export const prettyExtender: PrettyExtender = {
    id: 'cwt-tag',
    register(registry, _labels, _previews): void {
        registry.register(CwtTagFormatter);
    }
};
