/**
 * @fileoverview Pretty Extender (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { LabelRegistry } from '../labels/labelRegistry';
import type { PrettyFormatterRegistry } from '../registry';
import type { PreviewGeneratorRegistry } from '../previews/previewGeneratorRegistry';

/**
 * A PrettyExtender is the unit of contribution for the pretty-view pipeline.
 *
 * Each spec/module owns its:
 * - label registrations
 * - formatter registrations
 *
 * The loader discovers extenders at runtime and calls `register()`.
 */
export interface PrettyExtender {
    /** Stable id for debugging/logging and future configuration. */
    readonly id: string;
    register(registry: PrettyFormatterRegistry, labels: LabelRegistry, previews: PreviewGeneratorRegistry): void;
}
