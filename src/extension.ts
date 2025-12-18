import * as vscode from 'vscode';
import { CborEditorProvider } from './cborEditorProvider';
import { InMemoryFileSystemProvider } from './preview/inMemoryFileSystem';
import { getBuiltInPreviewSystem } from './preview/getBuiltInPreviewSystem';

export function activate(context: vscode.ExtensionContext) {
    console.log('CBOR Viewer extension is now active');

    const memFs = new InMemoryFileSystemProvider('cborViewerMem');
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('cborViewerMem', memFs, {
            isReadonly: true,
            isCaseSensitive: true
        })
    );

    // Preview behavior is contributed by preview extenders (commands + webview actions).
    getBuiltInPreviewSystem().activateCommands(context, memFs);

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
}

export function deactivate() {
    console.log('CBOR Viewer extension is now deactivated');
}
