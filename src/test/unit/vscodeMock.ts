export type CommandHandler = (...args: any[]) => any;

export interface VscodeMockState {
    registeredCommands: Map<string, CommandHandler>;
    executedCommands: Array<{ command: string; args: any[] }>; 
    infoMessages: string[];
    errorMessages: string[];
    shownTextDocuments: any[];
    registeredFileSystems: Array<{ scheme: string }>;
    registeredCustomEditors: Array<{ viewType: string }>;

    configuration: Record<string, unknown>;

    activeTextEditor?: {
        selection: { isEmpty: boolean };
        document: { uri: any; getText: (sel: any) => string };
    };
}

import * as fs from 'fs';

class Disposable {
    constructor(private readonly fn?: () => void) {}
    dispose() {
        try {
            this.fn?.();
        } catch {
            // ignore
        }
    }
}

class EventEmitter<T> {
    private listeners: Array<(e: T) => any> = [];
    public event = (listener: (e: T) => any): Disposable => {
        this.listeners.push(listener);
        return new Disposable(() => {
            const idx = this.listeners.indexOf(listener);
            if (idx >= 0) this.listeners.splice(idx, 1);
        });
    };

    fire(data: T) {
        for (const l of [...this.listeners]) {
            try {
                l(data);
            } catch {
                // ignore
            }
        }
    }
}

class Uri {
    constructor(
        public readonly scheme: string,
        public readonly path: string
    ) {}

    static parse(input: string): Uri {
        // Very small URI parser for our tests.
        // Supports: scheme:/path and scheme:///path
        const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/?\/?(.*)$/.exec(input);
        if (!m) {
            return new Uri('unknown', input);
        }
        const scheme = m[1];
        const rest = m[2] ?? '';
        const path = rest.startsWith('/') ? rest : `/${rest}`;
        return new Uri(scheme, path);
    }

    static file(fsPath: string): Uri {
        const normalized = fsPath.replace(/\\/g, '/');
        return new Uri('file', normalized.startsWith('/') ? normalized : `/${normalized}`);
    }

    static joinPath(base: Uri, ...paths: string[]): Uri {
        const joined = [base.path, ...paths]
            .join('/')
            .replace(/\/+/g, '/')
            .replace(/\/\.\//g, '/');
        return new Uri(base.scheme, joined.startsWith('/') ? joined : `/${joined}`);
    }

    get fsPath(): string {
        if (this.scheme === 'file') {
            return this.path.replace(/^\//, '').replace(/\//g, '\\');
        }
        return this.path;
    }

    toString(): string {
        return `${this.scheme}:${this.path}`;
    }
}

enum FileChangeType {
    Changed = 2,
    Created = 1,
    Deleted = 3
}

enum FileType {
    File = 1,
    Directory = 2
}

class FileSystemError extends Error {
    static FileNotFound(_uri: any) {
        const e = new FileSystemError('File not found');
        (e as any).code = 'FileNotFound';
        return e;
    }
    static NoPermissions(message?: string) {
        const e = new FileSystemError(message || 'No permissions');
        (e as any).code = 'NoPermissions';
        return e;
    }
}

export function createVscodeMock(initial?: Partial<VscodeMockState>) {
    const state: VscodeMockState = {
        registeredCommands: new Map(),
        executedCommands: [],
        infoMessages: [],
        errorMessages: [],
        shownTextDocuments: [],
        registeredFileSystems: [],
        registeredCustomEditors: [],
        configuration: {},
        activeTextEditor: undefined,
        ...initial
    };

    const vscode = {
        Uri,
        Disposable,
        EventEmitter,
        FileSystemError,
        FileChangeType,
        FileType,

        workspace: {
            registerFileSystemProvider: (scheme: string, _provider: any, _options: any) => {
                state.registeredFileSystems.push({ scheme });
                return new Disposable();
            },
            fs: {
                stat: async (uri: any) => {
                    const st = fs.statSync(uri.fsPath);
                    return { type: FileType.File, ctime: st.ctimeMs, mtime: st.mtimeMs, size: st.size };
                },
                readFile: async (uri: any) => {
                    return new Uint8Array(fs.readFileSync(uri.fsPath));
                }
            },
            getConfiguration: (_section: string) => ({
                get: (key: string, defaultValue: any) => {
                    const composite = `${_section}.${key}`;
                    const val = Object.prototype.hasOwnProperty.call(state.configuration, composite)
                        ? (state.configuration as any)[composite]
                        : undefined;
                    return val === undefined ? defaultValue : val;
                }
            }),
            openTextDocument: async (uri: any) => ({ uri })
        },

        window: {
            get activeTextEditor() {
                return state.activeTextEditor;
            },
            set activeTextEditor(v: any) {
                state.activeTextEditor = v;
            },
            showInformationMessage: async (msg: string) => {
                state.infoMessages.push(String(msg));
                return undefined;
            },
            showErrorMessage: async (msg: string) => {
                state.errorMessages.push(String(msg));
                return undefined;
            },
            showTextDocument: async (doc: any, _opts: any) => {
                state.shownTextDocuments.push(doc);
                return undefined;
            },
            registerCustomEditorProvider: (viewType: string, _provider: any, _opts: any) => {
                state.registeredCustomEditors.push({ viewType });
                return new Disposable();
            }
        },

        commands: {
            registerCommand: (command: string, handler: CommandHandler) => {
                state.registeredCommands.set(command, handler);
                return new Disposable(() => state.registeredCommands.delete(command));
            },
            executeCommand: async (command: string, ...args: any[]) => {
                state.executedCommands.push({ command, args });
                return undefined;
            }
        }
    };

    return { vscode, state };
}
