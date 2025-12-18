import * as vscode from 'vscode';
import { decodeCbor } from './cborDecoder';

export class CborEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static readonly viewType = 'cborViewer.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

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

        // Read the CBOR file
        const fileData = await vscode.workspace.fs.readFile(document.uri);

        // Decode CBOR to JSON
        let decodedData: any;
        let errorMessage: string | undefined;
        
        try {
            decodedData = await decodeCbor(fileData);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
        }

        // Update the webview content
        webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            document.uri,
            decodedData,
            errorMessage
        );
    }

    private getHtmlForWebview(
        webview: vscode.Webview,
        uri: vscode.Uri,
        decodedData: any,
        errorMessage?: string
    ): string {
        const nonce = this.getNonce();

        const jsonString = errorMessage
            ? undefined
            : JSON.stringify(decodedData, null, 2);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>CBOR Viewer</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
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
    </style>
</head>
<body>
    <div class="header">
        <div class="filename">${this.escapeHtml(uri.fsPath.split(/[\\/]/).pop() || 'CBOR File')}</div>
        <div>Decoded CBOR Content</div>
    </div>
    ${errorMessage ? `<div class="error"><strong>Error:</strong> ${this.escapeHtml(errorMessage)}</div>` : ''}
    ${jsonString ? `<pre id="json-content">${this.escapeHtml(jsonString)}</pre>` : ''}
    <script nonce="${nonce}">
        (function() {
            const jsonContent = document.getElementById('json-content');
            if (jsonContent) {
                // Simple syntax highlighting
                const text = jsonContent.textContent || '';
                const highlighted = text
                    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
                    .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
                    .replace(/: (-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
                    .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
                    .replace(/: null/g, ': <span class="json-null">null</span>');
                jsonContent.innerHTML = highlighted;
            }
        })();
    </script>
</body>
</html>`;
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
