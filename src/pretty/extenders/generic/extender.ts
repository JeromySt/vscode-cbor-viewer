/**
 * @fileoverview Extender (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyExtender } from '../prettyExtender';
import { GenericCborFormatter } from './genericCborFormatter';
import { BytesPreviewGenerator } from './bytesPreviewGenerator';

export const prettyExtender: PrettyExtender = {
    id: 'generic',
    register(registry, _labels, previews): void {
        registry.register(GenericCborFormatter);
        previews.register(BytesPreviewGenerator);
    }
};
