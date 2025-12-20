/**
 * @fileoverview Cwt Claims Labels (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { LabelRegistry } from '../../labels/labelRegistry';

const WELL_KNOWN_CWT_CLAIMS: Record<number, string> = {
    1: 'iss (Issuer)',
    2: 'sub (Subject)',
    3: 'aud (Audience)',
    4: 'exp (Expiration)',
    5: 'nbf (Not Before)',
    6: 'iat (Issued At)',
    7: 'cti (CWT ID)'
};

export function getCwtClaimName(labelId: number | null): string {
    if (labelId === null) {
        return 'CWT Claim (custom)';
    }
    return WELL_KNOWN_CWT_CLAIMS[labelId] ?? 'CWT Claim (custom)';
}

export function registerCwtClaimLabels(registry: LabelRegistry): void {
    for (const [k, v] of Object.entries(WELL_KNOWN_CWT_CLAIMS)) {
        registry.register('cwtClaim', Number(k), v);
    }
}
