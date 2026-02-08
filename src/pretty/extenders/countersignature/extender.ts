/**
 * @fileoverview Extender (pretty extender).
 *
 * Registers COSE countersignature formatters for RFC 9338:
 * - Header-level formatter for labels 7 (v1), 11 (CounterSignatureV2), 12 (CounterSignature0V2)
 * - Tag-level formatter for CBOR tag 19 (COSE_Countersignature)
 */
import type { PrettyExtender } from '../prettyExtender';
import { CoseCountersignatureFormatter, CoseCountersignatureTagFormatter } from './coseCountersignatureFormatter';

// RFC 9338 countersignature header parameters, registered by this extender.
const COUNTERSIGNATURE_HEADER_LABELS: Record<number, string> = {
    11: 'CounterSignatureV2 (RFC 9338)',
    12: 'CounterSignature0V2 (RFC 9338)'
};

export const prettyExtender: PrettyExtender = {
    id: 'countersignature',
    register(registry, labels, _previews): void {
        for (const [k, v] of Object.entries(COUNTERSIGNATURE_HEADER_LABELS)) {
            labels.register('coseHeader', Number(k), v);
        }
        registry.register(CoseCountersignatureFormatter);
        registry.register(CoseCountersignatureTagFormatter);
    }
};
