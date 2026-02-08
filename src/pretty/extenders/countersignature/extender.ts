/**
 * @fileoverview Extender (pretty extender).
 *
 * Registers COSE countersignature formatters for RFC 9338:
 * - Header-level formatter for labels 7 (v1), 11 (CounterSignatureV2), 12 (CounterSignature0V2)
 * - Tag-level formatter for CBOR tag 19 (COSE_Countersignature)
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseCountersignatureFormatter, CoseCountersignatureTagFormatter } from './coseCountersignatureFormatter';

export const prettyExtender: PrettyExtender = {
    id: 'countersignature',
    register(registry, _labels, _previews): void {
        registry.register(CoseCountersignatureFormatter);
        registry.register(CoseCountersignatureTagFormatter);
    }
};
