/**
 * @fileoverview Load Built In Extenders (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { LabelRegistry } from '../labels/labelRegistry';
import type { PrettyFormatterRegistry } from '../registry';
import type { PrettyExtender } from './prettyExtender';
import type { PreviewGeneratorRegistry } from '../previews/previewGeneratorRegistry';

function isPrettyExtender(value: unknown): value is PrettyExtender {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const v = value as any;
    return typeof v.id === 'string' && typeof v.register === 'function';
}

/**
 * Dynamically discovers built-in extenders by scanning `./extenders/<dir>/extender`.
 *
 * This keeps the architecture "pure": core wires the pipeline, extenders supply
 * all domain behavior (including the generic CBOR fallback).
 *
 * Why dynamic discovery (instead of a hard-coded list):
 * - Contributors can add new extenders without editing a central "index" file.
 * - Ordering is stable and reviewable: folders are loaded in lexicographic order.
 * - Tests can selectively include/exclude extenders by controlling the runtime module layout.
 */
export function registerBuiltInExtenders(registry: PrettyFormatterRegistry, labels: LabelRegistry, previews: PreviewGeneratorRegistry): void {
    const baseDir = __dirname;
    const dirents = fs.readdirSync(baseDir, { withFileTypes: true });
    const extenderDirs = dirents
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort((a, b) => a.localeCompare(b));

    let registeredCount = 0;

    for (const dir of extenderDirs) {
        const extenderModuleBase = path.join(baseDir, dir, 'extender');
        const extenderJs = `${extenderModuleBase}.js`;
        const extenderTs = `${extenderModuleBase}.ts`;

        // Only attempt to load directories that actually look like extenders.
        if (!fs.existsSync(extenderJs) && !fs.existsSync(extenderTs)) {
            continue;
        }

        // Use `require` so this works in the compiled extension output without bundling.
        // This also makes it easy to keep extenders as separate modules.
        const mod = require(extenderModuleBase) as any;
        const extender: unknown = mod.prettyExtender ?? mod.extender ?? mod.default;

        if (!isPrettyExtender(extender)) {
            throw new Error(`Invalid pretty extender module: ${extenderModuleBase}`);
        }

        extender.register(registry, labels, previews);
        registeredCount++;
    }

    if (registeredCount === 0) {
        throw new Error('No pretty extenders were registered.');
    }
}
