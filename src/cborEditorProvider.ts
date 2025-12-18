import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cbor from 'cbor';
import { decodeCborDecodedValueWithViews, decodeCborWithViews, DecodeViewsResult } from './cborDecoder';
import { InMemoryFileSystemProvider } from './inMemoryFileSystem';

export class CborEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static readonly viewType = 'cborViewer.editor';

    private static readonly HEX_TOKEN = '___CBOR_HEX_LINK___';
    private static readonly PAYLOAD_TOKEN = '___CBOR_PAYLOAD_PREVIEW___';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly memFs: InMemoryFileSystemProvider
    ) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        let decodedData: unknown;
        let decodedViews: DecodeViewsResult | undefined;
        let errorMessage: string | undefined;
        let blobs: Map<string, Buffer> = new Map();
        const configuredDefaultView = vscode.workspace
            .getConfiguration('cborViewer')
            .get<string>('defaultViewMode', 'pretty');
        let viewMode: 'pretty' | 'raw' = configuredDefaultView === 'raw' ? 'raw' : 'pretty';

        // Decode CBOR to JSON
        
        try {
            const decoded = await this.decodeDocument(document.uri);
            decodedViews = decoded;
            decodedData = viewMode === 'raw' ? decoded.raw : decoded.pretty;
            blobs = decoded.blobs;
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
        }

        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            if (!message || typeof message !== 'object') {
                return;
            }

            if (message.type === 'webviewLog') {
                const level = typeof (message as any).level === 'string' ? String((message as any).level) : 'info';
                const msg = typeof (message as any).message === 'string' ? (message as any).message : '';
                const details = typeof (message as any).details === 'string' ? (message as any).details : undefined;
                const line = `[CBOR Viewer webview] ${msg}${details ? `\n${details}` : ''}`;
                if (level === 'error') {
                    console.error(line);
                } else if (level === 'warn') {
                    console.warn(line);
                } else {
                    console.log(line);
                }
                return;
            }

            if (message.type === 'pong') {
                const t = (message as any).t;
                console.log(`[CBOR Viewer] pong<-webview t=${typeof t === 'number' ? t : 'n/a'}`);
                return;
            }

            if (message.type === 'openHexBlob') {
                const blobId = typeof (message as any).blobId === 'string' ? (message as any).blobId : undefined;
                if (!blobId) {
                    return;
                }

                const bytes = blobs.get(blobId);
                if (!bytes) {
                    return;
                }

                // Open in the built-in Hex Editor without writing to disk.
                const memUri = this.memFs.createUri(`${blobId}.bin`, bytes);
                await vscode.commands.executeCommand('vscode.openWith', memUri, 'hexEditor.hexedit');
            }

            if (message.type === 'openTextBlob') {
                const blobId = typeof (message as any).blobId === 'string' ? (message as any).blobId : undefined;
                if (!blobId) {
                    return;
                }

                const bytes = blobs.get(blobId);
                if (!bytes) {
                    return;
                }

                // Render bytes as UTF-8 text in a normal text editor.
                const text = Buffer.from(bytes).toString('utf8');
                const memUri = this.memFs.createUri(`${blobId}.txt`, Buffer.from(text, 'utf8'));
                const doc = await vscode.workspace.openTextDocument(memUri);
                await vscode.window.showTextDocument(doc, { preview: true });
            }

            if (message.type === 'decodeAsCbor') {
                const kind = typeof (message as any).kind === 'string' ? (message as any).kind : undefined;
                if (!kind) {
                    return;
                }

                let bytesToDecode: Uint8Array | undefined;

                if (kind === 'blobId') {
                    const blobId = typeof (message as any).blobId === 'string' ? (message as any).blobId : undefined;
                    if (!blobId) {
                        return;
                    }
                    const bytes = blobs.get(blobId);
                    if (!bytes) {
                        void vscode.window.showErrorMessage(`CBOR Viewer: Blob not found: ${blobId}`);
                        return;
                    }
                    bytesToDecode = bytes;
                } else if (kind === 'hex') {
                    const hex = typeof (message as any).hex === 'string' ? (message as any).hex : undefined;
                    if (!hex) {
                        return;
                    }
                    const parsed = this.tryParseHex(hex);
                    if (!parsed) {
                        void vscode.window.showErrorMessage('CBOR Viewer: Invalid hex string.');
                        return;
                    }
                    bytesToDecode = parsed;
                } else if (kind === 'stringBase64') {
                    const str = typeof (message as any).value === 'string' ? (message as any).value : undefined;
                    if (str === undefined) {
                        return;
                    }
                    const decoded = this.tryDecodeBase64ToBytes(str);
                    if (!decoded) {
                        void vscode.window.showErrorMessage('CBOR Viewer: String is not valid base64/base64url.');
                        return;
                    }
                    bytesToDecode = decoded;
                } else if (kind === 'byteArray') {
                    const arr = Array.isArray((message as any).bytes) ? (message as any).bytes : undefined;
                    if (!arr) {
                        return;
                    }
                    const decoded = this.tryDecodeByteArray(arr);
                    if (!decoded) {
                        void vscode.window.showErrorMessage('CBOR Viewer: Byte array must be integers 0..255.');
                        return;
                    }
                    bytesToDecode = decoded;
                } else {
                    return;
                }

                try {
                    const filename = `decoded-${Date.now()}-${Math.random().toString(16).slice(2)}.cbor`;
                    const outUri = this.memFs.createUri(filename, bytesToDecode);
                    await vscode.commands.executeCommand('vscode.openWith', outUri, 'cborViewer.editor');
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    void vscode.window.showErrorMessage(`CBOR Viewer: Failed to open decoded CBOR: ${msg}`);
                }
            }

            if (message.type === 'setViewMode') {
                const mode = (message as any).mode;
                if (mode !== 'pretty' && mode !== 'raw') {
                    return;
                }
                if (!decodedViews) {
                    return;
                }
                viewMode = mode;
                const next = viewMode === 'raw' ? decodedViews.raw : decodedViews.pretty;
                const sanitized = this.sanitizeForWebview(next);
                await webviewPanel.webview.postMessage({
                    type: 'setJson',
                    viewMode,
                    json: JSON.stringify(sanitized, null, 2)
                });
            }
        });

        // Update the webview content
        webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            document.uri,
            decodedData,
            errorMessage,
            viewMode
        );

        // Handshake: confirm the webview script is running and can post messages back.
        // This is intentionally best-effort; failures should not break viewing.
        setTimeout(async () => {
            try {
                const ok = await webviewPanel.webview.postMessage({ type: 'ping', t: Date.now() });
                console.log(`[CBOR Viewer] ping->webview posted ok=${ok}`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn(`[CBOR Viewer] ping->webview failed: ${msg}`);
            }
        }, 0);
    }

    private getHtmlForWebview(
        webview: vscode.Webview,
        uri: vscode.Uri,
        decodedData: unknown,
        errorMessage?: string
        , viewMode: 'pretty' | 'raw' = 'pretty'
    ): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'cborViewerWebview.js')
        );

        const jsonString = errorMessage ? undefined : JSON.stringify(this.sanitizeForWebview(decodedData), null, 2);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
    <title>CBOR Viewer</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
        }
        .webview-error {
            display: none;
            margin: 12px 0;
            padding: 8px 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-errorForeground);
            font-size: 12px;
            white-space: pre-wrap;
        }
        .webview-status {
            display: block;
            margin: 12px 0;
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-editor-foreground);
            font-size: 12px;
            white-space: pre-wrap;
            opacity: 0.85;
        }
        .header {
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .filename {
            font-weight: bold;
            font-size: 1.2em;
            margin-bottom: 5px;
        }
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .json-key {
            color: var(--vscode-symbolIcon-keyForeground, #569cd6);
        }
        .json-string {
            color: var(--vscode-symbolIcon-stringForeground, #ce9178);
        }
        .json-number {
            color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
        }
        .json-boolean {
            color: var(--vscode-symbolIcon-booleanForeground, #569cd6);
        }
        .json-null {
            color: var(--vscode-symbolIcon-nullForeground, #808080);
        }
        a.hex-preview-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        a.hex-preview-link:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        a.payload-preview-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
            display: inline-block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            vertical-align: bottom;
        }
        a.payload-preview-link:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        .context-menu {
            position: fixed;
            z-index: 9999;
            background: var(--vscode-menu-background);
            color: var(--vscode-menu-foreground);
            border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
            border-radius: 4px;
            padding: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            display: none;
            min-width: 180px;
        }
        .context-menu button {
            width: 100%;
            text-align: left;
            border: none;
            background: transparent;
            color: inherit;
            padding: 6px 8px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 12px;
        }
        .context-menu button:hover {
            background: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }
    </style>
</head>
<body data-view-mode="${viewMode}" data-hex-token="${CborEditorProvider.HEX_TOKEN}" data-payload-token="${CborEditorProvider.PAYLOAD_TOKEN}">
    <div class="header">
        <div class="filename">${this.escapeHtml(uri.fsPath.split(/[\\/]/).pop() || 'CBOR File')}</div>
        <div>Decoded CBOR Content</div>
    </div>
    <div id="webview-status" class="webview-status">CBOR Viewer: initializing webview…</div>
    <div id="webview-error" class="webview-error"></div>
    ${errorMessage ? `<div class="error"><strong>Error:</strong> ${this.escapeHtml(errorMessage)}</div>` : ''}
    ${jsonString ? `<pre id="json-content">${this.escapeHtml(jsonString)}</pre>` : ''}
    <div id="context-menu" class="context-menu"></div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    private async decodeDocument(uri: vscode.Uri): Promise<DecodeViewsResult> {
        // For local on-disk files, prefer streaming decode when the file is large.
        // For remote/virtual schemes, VS Code only exposes readFile(), so fall back to full-buffer decode.
        const stat = await vscode.workspace.fs.stat(uri);

        const thresholdMiB = vscode.workspace.getConfiguration('cborViewer').get<number>('streamingThresholdMiB', 5);
        const thresholdBytes = Math.max(0, Math.floor((thresholdMiB ?? 5) * 1024 * 1024));

        if (thresholdBytes > 0 && uri.scheme === 'file' && stat.size >= thresholdBytes) {
            const decoded = await this.decodeLargeFileStream(uri);
            return decodeCborDecodedValueWithViews(decoded, stat.size);
        }

        const fileData = await vscode.workspace.fs.readFile(uri);
        return decodeCborWithViews(fileData);
    }

    private async decodeLargeFileStream(uri: vscode.Uri): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(uri.fsPath);
            const decoder = new cbor.Decoder();

            const cleanup = () => {
                decoder.removeAllListeners();
                stream.removeAllListeners();
                try {
                    stream.destroy();
                } catch {
                    // ignore
                }
            };

            decoder.on('data', (value: unknown) => {
                cleanup();
                resolve(value);
            });
            decoder.on('error', (err: unknown) => {
                cleanup();
                reject(err instanceof Error ? err : new Error(String(err)));
            });
            stream.on('error', (err: unknown) => {
                cleanup();
                reject(err instanceof Error ? err : new Error(String(err)));
            });

            stream.pipe(decoder);
        });
    }

    private sanitizeForWebview(value: unknown): unknown {
        const seen = new Set<unknown>();

        const sanitizeInner = (v: unknown): unknown => {
            if (v === null || v === undefined) {
                return v;
            }

            const t = typeof v;
            if (t === 'string' || t === 'number' || t === 'boolean') {
                return v;
            }
            if (t !== 'object') {
                return v;
            }

            if (seen.has(v)) {
                return v;
            }
            seen.add(v);

            if (Array.isArray(v)) {
                return v.map(sanitizeInner);
            }

            const obj = v as Record<string, unknown>;

            // Special-case bytes preview objects so we can linkify without exposing blob ids.
            if (
                obj._type === 'bytes' &&
                typeof obj.hexPreview === 'string' &&
                typeof obj._hexBlobId === 'string'
            ) {
                const blobId = obj._hexBlobId as string;
                const out: Record<string, unknown> = {};
                for (const [k, val] of Object.entries(obj)) {
                    if (k === '_hexBlobId') {
                        continue;
                    }
                    if (k === 'hexPreview' && typeof val === 'string') {
                        out.hexPreview = `${CborEditorProvider.HEX_TOKEN}${blobId}|${val}`;
                        continue;
                    }
                    if (k === 'textPreview' && typeof val === 'string') {
                        out.textPreview = val.startsWith(CborEditorProvider.PAYLOAD_TOKEN)
                            ? val
                            : `${CborEditorProvider.PAYLOAD_TOKEN}${blobId}|${val}`;
                        continue;
                    }
                    out[k] = sanitizeInner(val);
                }
                return out;
            }

            const out: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(obj)) {
                if (k === '_hexBlobId') {
                    continue;
                }
                out[k] = sanitizeInner(val);
            }
            return out;
        };

        return sanitizeInner(value);
    }

    private tryParseHex(hex: string): Uint8Array | undefined {
        const cleaned = hex.trim().replace(/^0x/i, '').replace(/\s+/g, '');
        if (!cleaned) {
            return new Uint8Array();
        }
        if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
            return undefined;
        }
        if (cleaned.length % 2 !== 0) {
            return undefined;
        }

        const buf = Buffer.from(cleaned, 'hex');
        return new Uint8Array(buf);
    }

    private tryDecodeBase64ToBytes(input: string): Uint8Array | undefined {
        const trimmed = input.trim();
        if (!trimmed) {
            return new Uint8Array();
        }

        // Support base64url too.
        let s = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
            return undefined;
        }
        const mod = s.length % 4;
        if (mod === 1) {
            return undefined;
        }
        if (mod !== 0) {
            s = s + '='.repeat(4 - mod);
        }

        const buf = Buffer.from(s, 'base64');
        if (buf.length === 0 && s.length > 0) {
            return undefined;
        }
        return new Uint8Array(buf);
    }

    private tryDecodeByteArray(arr: unknown[]): Uint8Array | undefined {
        const out = new Uint8Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) {
                return undefined;
            }
            out[i] = n;
        }
        return out;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
