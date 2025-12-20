/**
 * @fileoverview Extender (preview extender).
 *
 * - Registers webview actions and/or commands related to preview links.
 * - Validates webview messages before performing privileged extension-host work.
 * - Uses the in-memory filesystem to open derived artifacts without touching disk.
 */
import type { PreviewExtender } from '../previewExtender';
import { PreviewSystem } from '../../previewSystem';
import { tryDecodeSelectionToBytes } from '../../selectionDecoders';

export const previewExtender: PreviewExtender = {
    id: 'decode-selection-command',
    register(system): void {
        system.registerCommand(({ memFs }) => {
            const vscode = PreviewSystem.vscode();
            return vscode.commands.registerCommand('cborViewer.decodeSelectionAsCbor', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    return;
                }

                const selection = editor.selection;
                if (selection.isEmpty) {
                    void vscode.window.showInformationMessage('Select base64, hex, or a JSON byte array to decode as CBOR.');
                    return;
                }

                const raw = editor.document.getText(selection);
                const bytes = tryDecodeSelectionToBytes(raw);
                if (!bytes) {
                    void vscode.window.showErrorMessage('Selection is not recognized as base64/base64url, hex, or a JSON byte array.');
                    return;
                }

                const memUri = memFs.createUri(`selection-${Date.now()}.cbor`, bytes);
                await vscode.commands.executeCommand('vscode.openWith', memUri, 'cborViewer.editor');
            });
        });
    }
};
