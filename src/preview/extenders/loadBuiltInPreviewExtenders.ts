/**
 * @fileoverview Load Built In Preview Extenders (preview extender).
 *
 * - Registers webview actions and/or commands related to preview links.
 * - Validates webview messages before performing privileged extension-host work.
 * - Uses the in-memory filesystem to open derived artifacts without touching disk.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { PreviewSystem } from '../previewSystem';
import type { PreviewExtender } from './previewExtender';

function tryRequireExtender(modulePath: string): PreviewExtender | undefined {
    const mod = require(modulePath) as any;
    const extender = mod?.previewExtender as PreviewExtender | undefined;
    if (!extender || typeof extender.id !== 'string' || typeof extender.register !== 'function') {
        return undefined;
    }
    return extender;
}

/**
 * Dynamically loads built-in preview extenders from `extenders/<dir>/extender`.
 *
 * Preview extenders contribute:
 * - webview message handlers (actions)
 * - preview hint kind metadata (how tokenized strings should be linkified)
 * - optional commands
 *
 * Unlike pretty extenders, we intentionally do NOT throw if none are found.
 * The webview has backward-compatible default linkification for hex/text previews.
 * Keeping activation resilient makes packaging/layout changes less disruptive.
 */
export function registerBuiltInPreviewExtenders(system: PreviewSystem): void {
    const extendersRoot = __dirname;

    let registeredCount = 0;
    for (const entry of fs.readdirSync(extendersRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            continue;
        }

        const dir = entry.name;
        // Skip non-extender folders.
        if (dir === 'node_modules' || dir.startsWith('.')) {
            continue;
        }

        const base = path.join(extendersRoot, dir, 'extender');
        const candidates = [`${base}.js`, `${base}.ts`];

        let extender: PreviewExtender | undefined;
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                extender = tryRequireExtender(p);
                break;
            }
        }

        if (!extender) {
            continue;
        }

        extender.register(system);
        registeredCount++;
    }

    // If no extenders were registered, keep the system usable.
    // This avoids breaking extension activation if packaging/layout changes.
    // The webview will fall back to built-in default behaviors.
}
