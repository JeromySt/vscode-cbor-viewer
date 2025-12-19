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

    registerCommand(register: (ctx: PreviewCommandContext) => vscode.Disposable): this {
        this.commandRegistrations.push(register);
        return this;
    }

    registerMessageHandler(type: string, handler: PreviewMessageHandler): this {
        const list = this.messageHandlers.get(type) ?? [];
        list.push(handler);
        this.messageHandlers.set(type, list);
        return this;
    }

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

    activateCommands(extensionContext: vscode.ExtensionContext, memFs: InMemoryFileSystemProvider): void {
        const ctx: PreviewCommandContext = { extensionContext, memFs };
        for (const reg of this.commandRegistrations) {
            const disp = reg(ctx);
            extensionContext.subscriptions.push(disp);
        }
    }

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
