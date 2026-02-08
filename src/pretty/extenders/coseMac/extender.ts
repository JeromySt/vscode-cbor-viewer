/**
 * @fileoverview Extender registration for COSE_Mac (Tag 97, RFC 9052).
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseMacFormatter } from './coseMacFormatter';

export const prettyExtender: PrettyExtender = {
    id: 'cose-mac',
    register(registry, _labels, _previews): void {
        registry.register(CoseMacFormatter);
    }
};
