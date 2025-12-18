import type { PreviewExtender } from '../previewExtender';
import { PreviewSystem } from '../../previewSystem';
import { tryDecodeBase64ToBytes, tryDecodeByteArray, tryParseHexToBytes } from '../../messageDecoders';

export const previewExtender: PreviewExtender = {
    id: 'decode-as-cbor',
    register(system): void {
        system.registerMessageHandler('decodeAsCbor', async (message, ctx) => {
            const kind = typeof message.kind === 'string' ? message.kind : undefined;
            if (!kind) {
                return true;
            }

            const vscode = PreviewSystem.vscode();
            let bytesToDecode: Uint8Array | undefined;

            if (kind === 'blobId') {
                const blobId = typeof message.blobId === 'string' ? message.blobId : undefined;
                if (!blobId) {
                    return true;
                }
                const bytes = ctx.blobs.get(blobId);
                if (!bytes) {
                    void vscode.window.showErrorMessage(`CBOR Viewer: Blob not found: ${blobId}`);
                    return true;
                }
                bytesToDecode = bytes;
            } else if (kind === 'hex') {
                const hex = typeof message.hex === 'string' ? message.hex : undefined;
                if (!hex) {
                    return true;
                }
                const parsed = tryParseHexToBytes(hex);
                if (!parsed) {
                    void vscode.window.showErrorMessage('CBOR Viewer: Invalid hex string.');
                    return true;
                }
                bytesToDecode = parsed;
            } else if (kind === 'stringBase64') {
                const str = typeof message.value === 'string' ? message.value : undefined;
                if (str === undefined) {
                    return true;
                }
                const decoded = tryDecodeBase64ToBytes(str);
                if (!decoded) {
                    void vscode.window.showErrorMessage('CBOR Viewer: String is not valid base64/base64url.');
                    return true;
                }
                bytesToDecode = decoded;
            } else if (kind === 'byteArray') {
                const arr = Array.isArray(message.bytes) ? message.bytes : undefined;
                if (!arr) {
                    return true;
                }
                const decoded = tryDecodeByteArray(arr);
                if (!decoded) {
                    void vscode.window.showErrorMessage('CBOR Viewer: Byte array must be integers 0..255.');
                    return true;
                }
                bytesToDecode = decoded;
            } else {
                return false;
            }

            try {
                const filename = `decoded-${Date.now()}-${Math.random().toString(16).slice(2)}.cbor`;
                const outUri = ctx.memFs.createUri(filename, bytesToDecode);
                await vscode.commands.executeCommand('vscode.openWith', outUri, 'cborViewer.editor');
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                void vscode.window.showErrorMessage(`CBOR Viewer: Failed to open decoded CBOR: ${msg}`);
            }

            return true;
        });
    }
};
