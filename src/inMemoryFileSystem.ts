import * as vscode from 'vscode';

export class InMemoryFileSystemProvider implements vscode.FileSystemProvider {
    private readonly files = new Map<string, { bytes: Uint8Array; ctime: number; mtime: number }>();
    private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

    constructor(private readonly scheme: string) {}

    private key(uri: vscode.Uri): string {
        // VS Code may normalize URI string representations differently depending on call site.
        // Using the path as the key is stable for our scheme.
        return uri.path;
    }

    public createUri(filename: string, bytes: Uint8Array): vscode.Uri {
        // Ensure absolute path-like uri.
        const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
        const uri = vscode.Uri.parse(`${this.scheme}:/${safeName}`);
        const now = Date.now();
        this.files.set(this.key(uri), { bytes, ctime: now, mtime: now });
        this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
        return uri;
    }

    public tryGetBytes(uri: vscode.Uri): Uint8Array | undefined {
        return this.files.get(this.key(uri))?.bytes;
    }

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const entry = this.files.get(this.key(uri));
        if (!entry) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        return {
            type: vscode.FileType.File,
            ctime: entry.ctime,
            mtime: entry.mtime,
            size: entry.bytes.byteLength
        };
    }

    readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
        return [];
    }

    createDirectory(_uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions('Read-only');
    }

    readFile(uri: vscode.Uri): Uint8Array {
        const entry = this.files.get(this.key(uri));
        if (!entry) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return entry.bytes;
    }

    writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean }): void {
        throw vscode.FileSystemError.NoPermissions('Read-only');
    }

    delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {
        throw vscode.FileSystemError.NoPermissions('Read-only');
    }

    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
        throw vscode.FileSystemError.NoPermissions('Read-only');
    }
}
