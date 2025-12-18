import * as assert from 'assert';
import mockRequire from 'mock-require';
import { createVscodeMock } from './vscodeMock';

suite('Unit: InMemoryFileSystemProvider', () => {
    teardown(() => {
        mockRequire.stopAll();
    });

    test('createUri stores bytes and readFile/stat returns them', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = await import('../../preview/inMemoryFileSystem');
        const fs = new InMemoryFileSystemProvider('mem');

        const uri = fs.createUri('a.bin', new Uint8Array([1, 2, 3]));

        const bytes = fs.readFile(uri);
        assert.strictEqual(bytes.byteLength, 3);
        assert.deepStrictEqual(Array.from(bytes), [1, 2, 3]);

        const stat = fs.stat(uri);
        assert.strictEqual(stat.size, 3);
        assert.strictEqual(stat.type, (vscode as any).FileType.File);

        assert.deepStrictEqual(fs.readDirectory(uri), []);

        const peek = fs.tryGetBytes(uri);
        assert.ok(peek);
        assert.deepStrictEqual(Array.from(peek!), [1, 2, 3]);

        const watcher = fs.watch(uri, { recursive: false, excludes: [] });
        assert.ok(watcher);
        watcher.dispose();
    });

    test('stat/readFile throws for missing file', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = await import('../../preview/inMemoryFileSystem');
        const fs = new InMemoryFileSystemProvider('mem');
        const missing = (vscode as any).Uri.parse('mem:/missing');

        assert.throws(() => fs.stat(missing));
        assert.throws(() => fs.readFile(missing));
    });

    test('write operations are read-only', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = await import('../../preview/inMemoryFileSystem');
        const fs = new InMemoryFileSystemProvider('mem');
        const uri = (vscode as any).Uri.parse('mem:/x');

        assert.throws(() => fs.createDirectory(uri));
        assert.throws(() => fs.writeFile(uri, new Uint8Array([1]), { create: true, overwrite: true }));
        assert.throws(() => fs.delete(uri, { recursive: true }));
        assert.throws(() => fs.rename(uri, uri, { overwrite: true }));
    });
});
