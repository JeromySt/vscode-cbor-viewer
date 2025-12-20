/**
 * @fileoverview Get Built In Preview System (preview pipeline).
 *
 * - Preview pipeline infrastructure (webview actions, derived artifacts, selection decoding).
 * - Designed to keep the webview unprivileged and the extension host in control.
 */
import { PreviewSystem } from './previewSystem';
import { registerBuiltInPreviewExtenders } from './extenders/loadBuiltInPreviewExtenders';

let builtIn: PreviewSystem | undefined;

/**
 * Accessor for the process-wide built-in `PreviewSystem`.
 *
 * Why a singleton:
 * - Preview extenders register message handlers and hint kinds that must be consistent across
 *   all open webviews.
 * - The editor provider may be constructed multiple times in a session; a singleton avoids
 *   duplicate registrations and keeps ordering stable.
 */
export function getBuiltInPreviewSystem(): PreviewSystem {
    if (!builtIn) {
        builtIn = new PreviewSystem();
        registerBuiltInPreviewExtenders(builtIn);
    }
    return builtIn;
}
