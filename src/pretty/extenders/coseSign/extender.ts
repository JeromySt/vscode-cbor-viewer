/**
 * @fileoverview Extender registration for COSE_Sign (Tag 98, RFC 9052).
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseSignFormatter } from './coseSignFormatter';

export const prettyExtender: PrettyExtender = {
    id: 'cose-sign',
    register(registry, _labels, _previews): void {
        registry.register(CoseSignFormatter);
    }
};
