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
    id: 'open-text-blob',
    register(system): void {
        system.registerMessageHandler('openTextBlob', async (message, ctx) => {
            const blobId = typeof message.blobId === 'string' ? message.blobId : undefined;
            if (!blobId) {
                return true;
            }

            const bytes = ctx.blobs.get(blobId);
            if (!bytes) {
                return true;
            }

            const vscode = PreviewSystem.vscode();
            const text = Buffer.from(bytes).toString('utf8');
            const memUri = ctx.memFs.createUri(`${blobId}.txt`, Buffer.from(text, 'utf8'));
            const doc = await vscode.workspace.openTextDocument(memUri);
            await vscode.window.showTextDocument(doc, { preview: true });
            return true;
        });
    }
};
