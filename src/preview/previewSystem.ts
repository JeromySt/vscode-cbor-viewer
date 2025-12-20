/**
 * @fileoverview Preview system: a lightweight extension point for webview actions + commands.
 *
 * The CBOR viewer surfaces "preview links" in the webview (e.g. hex/text previews) that represent
 * opaque blobs stored in the extension process.
 *
 * Rather than hard-coding behaviors into the editor provider, we route actions through this
 * registry so features can be added as *preview extenders*:
 * - commands that run in the extension host (e.g. open extracted blob in hex editor)
 * - webview message handlers (e.g. "decode as CBOR", "decode as COSE headers")
 * - preview hint kind registrations (how the webview should linkify tokens)
 *
 * Why a custom system (instead of calling commands directly from the webview):
 * - The webview is an untrusted UI surface; messages should be validated and handled centrally.
 * - It keeps the editor provider focused on lifecycle and rendering.
 */

import type * as vscode from 'vscode';
import type { InMemoryFileSystemProvider } from './inMemoryFileSystem';

function getVscode(): typeof import('vscode') {
    // Lazy require so unit tests that swap vscode mocks per-test
    // don't get stuck with a cached reference.
    return require('vscode');
}

export interface PreviewCommandContext {
    extensionContext: vscode.ExtensionContext;
    memFs: InMemoryFileSystemProvider;
}

export interface PreviewMessageContext {
    memFs: InMemoryFileSystemProvider;
    blobs: Map<string, Buffer>;
}

export interface PreviewWebviewMenuItemTemplate {
    label: string;
    message: Record<string, unknown>;
}

export interface PreviewHintKindConfig {
    /** Hint kind identifier (e.g. 'hex', 'text'). */
    kind: string;
    /** Token prefix that indicates this hint in string values. */
    token: string;
    /** CSS class applied to the generated <a>. */
    cssClass: string;
    /** Message template posted on click. Use "$blobId" placeholder for the blob id. */
    onClickMessage?: Record<string, unknown>;
    /** Context menu actions for this kind. Use "$blobId" placeholder for the blob id. */
    contextMenuItems?: PreviewWebviewMenuItemTemplate[];
    /** Optional truncation in characters for display text. */
    truncateChars?: number;
    /** When true, sets title to the full (untruncated) value. */
    titleIsFullValue?: boolean;
}

export type PreviewMessageHandler = (message: any, ctx: PreviewMessageContext) => Promise<boolean> | boolean;

export class PreviewSystem {
    private readonly commandRegistrations: Array<(ctx: PreviewCommandContext) => vscode.Disposable> = [];
    private readonly messageHandlers = new Map<string, PreviewMessageHandler[]>();
    private readonly previewHintKinds: PreviewHintKindConfig[] = [];

    /** Register a command contributor. Registration happens at activation time. */
    registerCommand(register: (ctx: PreviewCommandContext) => vscode.Disposable): this {
        this.commandRegistrations.push(register);
        return this;
    }

    /** Register a handler for a specific `message.type` sent from the webview. */
    registerMessageHandler(type: string, handler: PreviewMessageHandler): this {
        const list = this.messageHandlers.get(type) ?? [];
        list.push(handler);
        this.messageHandlers.set(type, list);
        return this;
    }

    /**
     * Register a preview hint kind.
     *
     * Each kind defines:
     * - the token prefix that will appear in JSON strings
     * - the CSS class to apply
     * - optional click and context menu actions
     *
     * We intentionally make "first registration wins" for a given `kind` to keep behavior stable
     * and predictable even if multiple extenders attempt to register the same identifier.
     */
    registerPreviewHintKind(config: PreviewHintKindConfig): this {
        if (!config || typeof config.kind !== 'string' || typeof config.token !== 'string' || typeof config.cssClass !== 'string') {
            return this;
        }
        // First registration wins for a given kind.
        if (this.previewHintKinds.some(k => k.kind === config.kind)) {
            return this;
        }
        this.previewHintKinds.push(config);
        return this;
    }

    getPreviewHintKinds(): PreviewHintKindConfig[] {
        return [...this.previewHintKinds];
    }

    getPreviewHintToken(kind: string): string | undefined {
        const k = this.previewHintKinds.find(h => h.kind === kind);
        return k?.token;
    }

    /** Activate all registered commands and bind them to the VS Code extension context. */
    activateCommands(extensionContext: vscode.ExtensionContext, memFs: InMemoryFileSystemProvider): void {
        const ctx: PreviewCommandContext = { extensionContext, memFs };
        for (const reg of this.commandRegistrations) {
            const disp = reg(ctx);
            extensionContext.subscriptions.push(disp);
        }
    }

    /**
     * Dispatch a webview message to registered handlers.
     *
     * Contract:
     * - A handler returns `true` when it has handled the message.
     * - Handlers run in registration order; first "true" wins.
     * - Unknown message types are ignored.
     */
    async handleWebviewMessage(message: any, ctx: PreviewMessageContext): Promise<boolean> {
        if (!message || typeof message !== 'object') {
            return false;
        }

        const type = typeof message.type === 'string' ? String(message.type) : undefined;
        if (!type) {
            return false;
        }

        const handlers = this.messageHandlers.get(type);
        if (!handlers || handlers.length === 0) {
            return false;
        }

        for (const h of handlers) {
            const handled = await h(message, ctx);
            if (handled) {
                return true;
            }
        }

        return false;
    }

    /** Convenience for extenders that want access to vscode APIs without importing eagerly. */
    static vscode(): typeof import('vscode') {
        return getVscode();
    }
}
