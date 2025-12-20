/**
 * @fileoverview Extender (preview extender).
 *
 * - Registers webview actions and/or commands related to preview links.
 * - Validates webview messages before performing privileged extension-host work.
 * - Uses the in-memory filesystem to open derived artifacts without touching disk.
 */
import type { PreviewExtender } from '../previewExtender';
import { PreviewSystem } from '../../previewSystem';

export const previewExtender: PreviewExtender = {
    id: 'open-hex-command',
    register(system): void {
        system.registerCommand(() => {
            const vscode = PreviewSystem.vscode();
            return vscode.commands.registerCommand('cborViewer.openHex', async (uri?: any) => {
                const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
                if (!targetUri) {
                    return;
                }

                await vscode.commands.executeCommand('vscode.openWith', targetUri, 'hexEditor.hexedit');
            });
        });
    }
};
