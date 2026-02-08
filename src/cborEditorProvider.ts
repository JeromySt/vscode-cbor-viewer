/**
 * @fileoverview VS Code custom editor provider for CBOR/COSE documents.
 *
 * High-level responsibilities:
 * - Decode the document into "pretty" and "raw" views (see `src/cborDecoder.ts`).
 * - Host the webview and respond to its messages (view toggles, context menu actions, etc.).
 * - Coordinate with the preview system, which is an extension point for commands and
 *   webview actions that operate on extracted byte blobs.
 *
 * Important design constraints (and why some code looks the way it does):
 * - The webview should never receive opaque blob ids directly unless they are embedded in a
 *   controlled tokenized string. This reduces accidental data exposure and makes the markup
 *   generation predictable.
 * - "Intentful" decodes (e.g. "decode protected headers") must operate on the decoded CBOR
 *   object, not on rendered JSON strings. This avoids brittle parsing and keeps semantics correct.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cbor from 'cbor';
import { decodeCborDecodedValueWithViews, DecodeViewsResult } from './cborDecoder';
import { InMemoryFileSystemProvider } from './preview/inMemoryFileSystem';
import { getBuiltInPreviewSystem } from './preview/getBuiltInPreviewSystem';
import { HEX_TOKEN, PAYLOAD_TOKEN } from './preview/previewHintTokens';

/**
 * Custom editor provider that renders decoded CBOR as a webview.
 *
 * This provider is read-only by design: the extension is meant to be a viewer/inspector.
 */
export class CborEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static readonly viewType = 'cborViewer.editor';

    // Cache the original decoded CBOR root per open document URI so we can offer
    // intentful actions that operate on specific COSE fields without re-parsing from the rendered JSON.
    private readonly decodedRootByUri = new Map<string, unknown>();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly memFs: InMemoryFileSystemProvider
    ) {}

    /**
     * Called when VS Code opens a document with our custom editor.
     *
     * We keep the returned document object intentionally small.
     * The key lifecycle hook is `dispose`, where we clear any per-document cached decoded root.
     */
    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return {
            uri,
            dispose: () => {
                try {
                    this.decodedRootByUri.delete(uri.toString());
                } catch {
                    // ignore
                }
            }
        };
    }

    /**
     * Called when VS Code needs us to (re)render the editor.
     *
     * Flow:
     * 1) Decode the document (possibly streaming for large local files).
     * 2) Render the initial HTML, embedding the JSON payload.
     * 3) Listen for webview messages and dispatch:
     *    - preview system actions (extenders)
     *    - editor-local actions (view mode toggle, COSE header extraction)
     */
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

        // Intentful decodes should open in Pretty mode so projections/labels are visible.
        try {
            const q = typeof (document.uri as any).query === 'string' ? String((document.uri as any).query) : '';
            if (q) {
                const params = new URLSearchParams(q);
                if (params.get('mode') === 'coseHeaders') {
                    viewMode = 'pretty';
                }
            }
        } catch {
            // ignore
        }

        // Decode CBOR to JSON (and cache the decoded root for intentful actions).
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

            // Preview-related actions are contributed by preview extenders.
            const handledByPreview = await getBuiltInPreviewSystem().handleWebviewMessage(message, {
                memFs: this.memFs,
                blobs
            });
            if (handledByPreview) {
                return;
            }

            if (message.type === 'decodeCoseHeadersPart') {
                const part = (message as any).part;
                if (part !== 'protected' && part !== 'unprotected') {
                    return;
                }

                const root = this.decodedRootByUri.get(document.uri.toString());
                if (!root) {
                    void vscode.window.showErrorMessage('CBOR Viewer: Unable to decode COSE headers (no decoded root available).');
                    return;
                }

                const headers = this.tryExtractCoseHeadersPart(root, part);
                if (!headers) {
                    void vscode.window.showErrorMessage('CBOR Viewer: Current document is not a COSE_Sign1 structure.');
                    return;
                }

                try {
                    const bytes = cbor.encodeOne(headers as any);
                    const filename = `decoded-cose-${part}-headers-${Date.now()}-${Math.random().toString(16).slice(2)}.coseheaders.cbor`;
                    const outUri = this.memFs.createUri(filename, new Uint8Array(bytes));
                    const outWithMode = outUri.with({ query: 'mode=coseHeaders' });
                    await vscode.commands.executeCommand('vscode.openWith', outWithMode, 'cborViewer.editor');
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    void vscode.window.showErrorMessage(`CBOR Viewer: Failed to open decoded COSE headers: ${msg}`);
                }

                return;
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
        let previewHintKindsJson = '[]';
        try {
            previewHintKindsJson = this.escapeHtml(JSON.stringify(getBuiltInPreviewSystem().getPreviewHintKinds()));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[CBOR Viewer] Failed to load preview hint kinds: ${msg}`);
        }

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
        a[data-preview-kind] {
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
        }
        a[data-preview-kind]:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        a.payload-preview-link {
            display: inline-block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            vertical-align: bottom;
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
<body data-view-mode="${viewMode}" data-hex-token="${HEX_TOKEN}" data-payload-token="${PAYLOAD_TOKEN}" data-preview-hint-kinds="${previewHintKindsJson}">
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
        // Some actions open virtual documents with an intent encoded in the URI query.
        // We keep the parsing logic defensive: invalid/unknown params should fall back to default viewing.
        const intent = (() => {
            try {
                const q = typeof (uri as any).query === 'string' ? String((uri as any).query) : '';
                if (!q) {
                    return 'default';
                }
                const params = new URLSearchParams(q);
                const mode = params.get('mode');
                return mode === 'coseHeaders' ? 'coseHeaders' : 'default';
            } catch {
                return 'default';
            }
        })();

        // For local on-disk files, prefer streaming decode when the file is large.
        // For remote/virtual schemes, VS Code only exposes readFile(), so fall back to full-buffer decode.
        const stat = await vscode.workspace.fs.stat(uri);

        const thresholdMiB = vscode.workspace.getConfiguration('cborViewer').get<number>('streamingThresholdMiB', 5);
        const thresholdBytes = Math.max(0, Math.floor((thresholdMiB ?? 5) * 1024 * 1024));

        if (thresholdBytes > 0 && uri.scheme === 'file' && stat.size >= thresholdBytes) {
            const decoded = await this.decodeLargeFileStream(uri);
            this.decodedRootByUri.set(uri.toString(), decoded);
            return decodeCborDecodedValueWithViews(decoded, stat.size, intent === 'coseHeaders' ? { prettyRootType: 'coseHeaders' } : undefined);
        }

        const fileData = await vscode.workspace.fs.readFile(uri);
        // Decode here so we can keep the original decoded root for intentful actions.
        const buffer = Buffer.from(fileData);
        const items = cbor.decodeAllSync(buffer);
        let decoded: unknown;
        if (items.length === 0) {
            throw new Error('Empty CBOR data: no data items found');
        } else if (items.length === 1) {
            decoded = items[0];
        } else {
            decoded = { _type: 'cbor-sequence', items };
        }
        this.decodedRootByUri.set(uri.toString(), decoded);
        return decodeCborDecodedValueWithViews(decoded, buffer.length, intent === 'coseHeaders' ? { prettyRootType: 'coseHeaders' } : undefined);
    }

    /**
     * Extract the "protected" or "unprotected" headers map from a COSE_Sign1 structure.
     *
     * COSE_Sign1 layout (after tag 18 unwrapping):
     * - index 0: protected headers (bstr containing an encoded map, or empty bstr)
     * - index 1: unprotected headers (map)
     * - index 2: payload
     * - index 3: signature
     *
     * Why decode protected headers here:
     * - The user action is specifically about headers.
     * - We want to open a derived CBOR document that is *just* the map so the pretty view can
     *   apply COSE header projections/labels.
     */
    private tryExtractCoseHeadersPart(root: unknown, part: 'protected' | 'unprotected'): Map<unknown, unknown> | undefined {
        // COSE_Sign1 is commonly tag(18) wrapping an array.
        const unwrapped = (() => {
            const tagged = root as any;
            if (tagged && typeof tagged === 'object' && typeof tagged.tag === 'number' && tagged.tag === 18 && tagged.value !== undefined) {
                return tagged.value;
            }
            return root;
        })();

        if (!Array.isArray(unwrapped) || unwrapped.length < 2) {
            return undefined;
        }

        const protectedBytes = unwrapped[0];
        const unprotectedMap = unwrapped[1];

        if (part === 'protected') {
            const b = this.toBytes(protectedBytes);
            if (!b || b.length === 0) {
                return new Map();
            }
            try {
                const decoded = cbor.decodeFirstSync(Buffer.from(b));
                if (decoded instanceof Map) {
                    return decoded as Map<unknown, unknown>;
                }
                if (decoded && typeof decoded === 'object') {
                    return new Map(Object.entries(decoded as any));
                }
                return undefined;
            } catch {
                return new Map();
            }
        }

        if (unprotectedMap instanceof Map) {
            return unprotectedMap as Map<unknown, unknown>;
        }
        if (unprotectedMap && typeof unprotectedMap === 'object') {
            return new Map(Object.entries(unprotectedMap as any));
        }

        return undefined;
    }

    /**
     * Normalize Node/VS Code byte-like values to a `Uint8Array`.
     *
     * We only accept actual byte containers here; we intentionally do NOT accept "number[]"
     * because COSE protected headers are a bstr in real encodings.
     */
    private toBytes(value: unknown): Uint8Array | undefined {
        if (!value) {
            return undefined;
        }
        if (value instanceof Uint8Array) {
            return value;
        }
        // Node Buffer
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
            return new Uint8Array(value);
        }
        return undefined;
    }

    /**
     * Streaming decode of large local files.
     *
     * Rationale:
     * - `workspace.fs.readFile` loads the entire file into memory.
     * - For multi-MiB CBOR payloads this can cause slowdowns or memory spikes.
     *
     * Collects all decoded items to support CBOR Sequences (RFC 8742).
     * Returns a single item directly, or a cbor-sequence wrapper for multiple items.
     */
    private async decodeLargeFileStream(uri: vscode.Uri): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(uri.fsPath);
            const decoder = new cbor.Decoder();
            const items: unknown[] = [];

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
                items.push(value);
            });
            decoder.on('end', () => {
                cleanup();
                if (items.length === 0) {
                    reject(new Error('Empty CBOR data: no data items found'));
                } else if (items.length === 1) {
                    resolve(items[0]);
                } else {
                    resolve({ _type: 'cbor-sequence', items });
                }
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

    /**
     * Prepare a decoded view object for transport to the webview.
     *
     * Security/robustness goals:
     * - Remove internal-only fields (e.g. `_hexBlobId`).
     * - Convert preview hints into tokenized strings, so the webview can linkify without
     *   needing access to raw blob ids or privileged extension APIs.
     * - Avoid infinite recursion if a formatter accidentally produces cycles.
     */
    private sanitizeForWebview(value: unknown): unknown {
        const seen = new Set<unknown>();
        let preview: ReturnType<typeof getBuiltInPreviewSystem> | undefined;
        try {
            preview = getBuiltInPreviewSystem();
        } catch {
            preview = undefined;
        }

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

            // Generic preview-hint support: any object can declare preview fields
            // that should be linkified in the webview without exposing blob ids.
            //
            // `_previewHints` is consumed here and removed from the JSON sent to the webview.
            const previewHints = obj._previewHints;
            if (previewHints && typeof previewHints === 'object' && !Array.isArray(previewHints)) {
                const hints = previewHints as any;
                const out: Record<string, unknown> = {};
                for (const [k, val] of Object.entries(obj)) {
                    if (k === '_hexBlobId' || k === '_previewHints') {
                        continue;
                    }

                    const hint = hints[k];
                    if (hint && typeof hint === 'object' && typeof val === 'string') {
                        const kind = typeof (hint as any).kind === 'string' ? String((hint as any).kind) : undefined;
                        const blobId = typeof (hint as any).blobId === 'string' ? String((hint as any).blobId) : undefined;
                        if (kind && blobId) {
                            const token = preview?.getPreviewHintToken(kind)
                                ?? (kind === 'hex' ? HEX_TOKEN : undefined)
                                ?? (kind === 'text' ? PAYLOAD_TOKEN : undefined);
                            if (token) {
                                out[k] = val.startsWith(token)
                                    ? val
                                    : `${token}${blobId}|${val}`;
                                continue;
                            }
                        }
                    }

                    out[k] = sanitizeInner(val);
                }
                return out;
            }

            // Special-case bytes preview objects so we can linkify without exposing blob ids.
            // Note: bytes previews are handled by `_previewHints` as well.

            const out: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(obj)) {
                if (k === '_hexBlobId') {
                    continue;
                }
                if (k === '_previewHints') {
                    continue;
                }
                out[k] = sanitizeInner(val);
            }
            return out;
        };

        return sanitizeInner(value);
    }

    /**
     * Generate a nonce suitable for CSP usage.
     *
     * Note: currently the webview uses `${webview.cspSource}` rather than a per-request nonce,
     * but we keep this utility around as a common pattern for future tightening.
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Minimal HTML escaping for embedding user-controlled text.
     *
     * This is used when inserting file names, error messages, and JSON into the webview HTML.
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
