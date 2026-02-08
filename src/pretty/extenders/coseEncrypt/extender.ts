/**
 * @fileoverview Extender registration for COSE_Encrypt (Tag 96, RFC 9052).
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseEncryptFormatter } from './coseEncryptFormatter';

export const prettyExtender: PrettyExtender = {
    id: 'cose-encrypt',
    register(registry, _labels, _previews): void {
        registry.register(CoseEncryptFormatter);
    }
};
