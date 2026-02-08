/**
 * @fileoverview Extender registration for COSE_Encrypt0 (Tag 16, RFC 9052).
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseEncrypt0Formatter } from './coseEncrypt0Formatter';

export const prettyExtender: PrettyExtender = {
    id: 'cose-encrypt0',
    register(registry, _labels, _previews): void {
        registry.register(CoseEncrypt0Formatter);
    }
};
