import type { LabelRegistry } from '../../labels/labelRegistry';

// COSE header parameter id for embedded CWT claims (claims map is its own RFC).
const COSE_CWT_CLAIMS_HEADER_ID = 15;

export function registerCoseCwtClaimsHeaderLabels(registry: LabelRegistry): void {
    registry.register('coseHeader', COSE_CWT_CLAIMS_HEADER_ID, 'CWT Claims');
}
