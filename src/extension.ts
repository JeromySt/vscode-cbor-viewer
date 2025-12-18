import * as vscode from 'vscode';
import { CborEditorProvider } from './cborEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('CBOR Viewer extension is now active');

    // Register the custom editor provider for CBOR files
    const provider = new CborEditorProvider(context);
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
}

export function deactivate() {
    console.log('CBOR Viewer extension is now deactivated');
}
