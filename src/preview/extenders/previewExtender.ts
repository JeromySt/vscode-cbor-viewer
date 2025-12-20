/**
 * @fileoverview Preview Extender (preview extender).
 *
 * - Registers webview actions and/or commands related to preview links.
 * - Validates webview messages before performing privileged extension-host work.
 * - Uses the in-memory filesystem to open derived artifacts without touching disk.
 */
import type { PreviewSystem } from '../previewSystem';

export interface PreviewExtender {
    readonly id: string;
    register(system: PreviewSystem): void;
}
