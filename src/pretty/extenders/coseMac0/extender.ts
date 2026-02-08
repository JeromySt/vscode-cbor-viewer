/**
 * @fileoverview Extender registration for COSE_Mac0 (Tag 17, RFC 9052).
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseMac0Formatter } from './coseMac0Formatter';

export const prettyExtender: PrettyExtender = {
    id: 'cose-mac0',
    register(registry, _labels, _previews): void {
        registry.register(CoseMac0Formatter);
    }
};
