/**
 * @fileoverview Extension activation entrypoint.
 *
 * This file intentionally stays very small and declarative:
 * - Wire up the in-memory filesystem used for “derived” artifacts (decoded blobs, extracted headers, etc.).
 * - Activate the preview system (commands + webview actions provided by preview extenders).
 * - Register the custom editor that hosts the webview UI.
 *
 * Keeping these responsibilities centralized makes the extension lifecycle easy to reason about:
 * everything that allocates disposables should flow through `context.subscriptions`.
 */

import * as vscode from 'vscode';
import { CborEditorProvider } from './cborEditorProvider';
import { InMemoryFileSystemProvider } from './preview/inMemoryFileSystem';
import { getBuiltInPreviewSystem } from './preview/getBuiltInPreviewSystem';

/**
 * Called by VS Code when the extension is activated.
 *
 * We prefer to initialize the in-memory FS and the preview system eagerly so that:
 * - preview extenders can register commands immediately,
 * - and webview actions can create virtual files without needing extra activation wiring.
 */
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

/**
 * Called by VS Code when the extension is deactivated.
 *
 * Most cleanup is handled by `context.subscriptions`. This function exists primarily for
 * debugging and to document that there is no bespoke teardown logic.
 */
export function deactivate() {
    console.log('CBOR Viewer extension is now deactivated');
}
