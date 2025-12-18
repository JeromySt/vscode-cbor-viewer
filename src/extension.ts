import * as vscode from 'vscode';
import { CborEditorProvider } from './cborEditorProvider';
import { InMemoryFileSystemProvider } from './inMemoryFileSystem';

export function activate(context: vscode.ExtensionContext) {
    console.log('CBOR Viewer extension is now active');

    const memFs = new InMemoryFileSystemProvider('cborViewerMem');
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('cborViewerMem', memFs, {
            isReadonly: true,
            isCaseSensitive: true
        })
    );

    const openHexDisposable = vscode.commands.registerCommand('cborViewer.openHex', async (uri?: vscode.Uri) => {
        const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!targetUri) {
            return;
        }

        // Use the built-in Hex Editor (ships with VS Code).
        await vscode.commands.executeCommand('vscode.openWith', targetUri, 'hexEditor.hexedit');
    });

    const decodeSelectionDisposable = vscode.commands.registerCommand('cborViewer.decodeSelectionAsCbor', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showInformationMessage('Select base64, hex, or a JSON byte array to decode as CBOR.');
            return;
        }

        const raw = editor.document.getText(selection);
        const bytes = tryDecodeSelectionToBytes(raw);
        if (!bytes) {
            vscode.window.showErrorMessage('Selection is not recognized as base64/base64url, hex, or a JSON byte array.');
            return;
        }

        // Open decoded CBOR bytes in our viewer via in-memory FS.
        const memUri = memFs.createUri(`selection-${Date.now()}.cbor`, bytes);
        await vscode.commands.executeCommand('vscode.openWith', memUri, 'cborViewer.editor');
    });

    // Register the custom editor provider for CBOR files
    const provider = new CborEditorProvider(context, memFs);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
        'cborViewer.editor',
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        }
    );

    context.subscriptions.push(providerRegistration);
    context.subscriptions.push(openHexDisposable);
    context.subscriptions.push(decodeSelectionDisposable);
}

export function deactivate() {
    console.log('CBOR Viewer extension is now deactivated');
}

function stripQuotes(input: string): string {
    const t = (input ?? '').trim();
    if (t.length >= 2) {
        const first = t[0];
        const last = t[t.length - 1];
        if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
            return t.slice(1, -1);
        }
    }
    return t;
}

function tryParseJson(input: string): unknown {
    const t = (input ?? '').trim();
    if (!t) return undefined;
    if (t[0] !== '[' && t[0] !== '{') return undefined;
    try {
        return JSON.parse(t);
    } catch {
        return undefined;
    }
}

function isByteArray(value: unknown): value is number[] {
    if (!Array.isArray(value) || value.length === 0) return false;
    for (let i = 0; i < value.length; i++) {
        const n = (value as any)[i];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) return false;
    }
    return true;
}

function tryParseHexToBytes(input: string): Uint8Array | undefined {
    const cleaned = stripQuotes(input).trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (!cleaned) return new Uint8Array();
    if (cleaned.length % 2 !== 0) return undefined;
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) return undefined;
    return new Uint8Array(Buffer.from(cleaned, 'hex'));
}

function tryDecodeBase64ToBytes(input: string): Uint8Array | undefined {
    let s = stripQuotes(input).trim();
    if (!s) return new Uint8Array();

    // Allow whitespace/newlines in selections.
    s = s.replace(/\s+/g, '');

    // Support base64url too.
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return undefined;
    const mod = s.length % 4;
    if (mod === 1) return undefined;
    if (mod === 2) s += '==';
    if (mod === 3) s += '=';

    try {
        const buf = Buffer.from(s, 'base64');
        if (!buf || buf.length === 0) return undefined;
        return new Uint8Array(buf);
    } catch {
        return undefined;
    }
}

function tryDecodeSelectionToBytes(selectionText: string): Uint8Array | undefined {
    const t = (selectionText ?? '').trim();
    if (!t) return undefined;

    // JSON byte array: [1,2,3]
    const parsed = tryParseJson(t);
    if (isByteArray(parsed)) {
        return new Uint8Array(parsed);
    }

    // Hex
    const hex = tryParseHexToBytes(t);
    if (hex) return hex;

    // Base64/base64url
    return tryDecodeBase64ToBytes(t);
}
