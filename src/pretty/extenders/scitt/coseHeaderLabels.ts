import type { LabelRegistry } from '../../labels/labelRegistry';

// SCITT-related COSE header parameters.
const WELL_KNOWN_SCITT_HEADERS: Record<number, string> = {
    393: 'scitt-receipts',
    394: 'scitt-statement'
};

export function registerScittHeaderLabels(registry: LabelRegistry): void {
    for (const [k, v] of Object.entries(WELL_KNOWN_SCITT_HEADERS)) {
        registry.register('coseHeader', Number(k), v);
    }
}
