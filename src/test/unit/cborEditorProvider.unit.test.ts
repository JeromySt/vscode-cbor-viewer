import * as assert from 'assert';
import mockRequire from 'mock-require';
import { createVscodeMock } from './vscodeMock';
import * as path from 'path';

suite('Unit: CborEditorProvider webview + messaging', () => {
    teardown(() => {
        mockRequire.stopAll();
    });

    test('getHtmlForWebview includes external script + CSP + data attributes', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        );

        const webview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
        } as any;

        const html = (provider as any).getHtmlForWebview(
            webview,
            (vscode as any).Uri.parse('file:/x.cbor'),
            { ok: true },
            undefined,
            'raw'
        ) as string;

        assert.ok(html.includes("script-src vscode-webview://test"));
        assert.ok(html.includes('media/cborViewerWebview.js'));
        assert.ok(html.includes('data-view-mode="raw"'));
        assert.ok(html.includes('data-hex-token'));
        assert.ok(html.includes('data-payload-token'));
    });

    test('openCustomDocument returns a CustomDocument with uri + dispose', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const uri = (vscode as any).Uri.parse('file:/x.cbor');
        const doc = await provider.openCustomDocument(uri, {} as any, {} as any);
        assert.ok(doc);
        assert.strictEqual(doc.uri.toString(), uri.toString());
        assert.doesNotThrow(() => doc.dispose());
    });

    test('getHtmlForWebview omits json <pre> when errorMessage is present', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        );

        const webview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
        } as any;

        const html = (provider as any).getHtmlForWebview(
            webview,
            (vscode as any).Uri.parse('file:/x.cbor'),
            { ok: true },
            'boom',
            'pretty'
        ) as string;

        assert.ok(html.includes('Error'));
        assert.ok(!html.includes('id="json-content"'));
    });

    test('sanitizeForWebview removes _hexBlobId and injects link tokens', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        );

        const input = {
            payload: {
                bytes: {
                    _type: 'bytes',
                    lengthBytes: 3,
                    hexPreview: '010203',
                    textPreview: 'abc',
                    _hexBlobId: 'blob-1'
                }
            }
        };

        const sanitized = (provider as any).sanitizeForWebview(input);
        const s = JSON.stringify(sanitized);

        assert.ok(!s.includes('_hexBlobId'));
        assert.ok(s.includes('___CBOR_HEX_LINK___'));
        assert.ok(s.includes('___CBOR_PAYLOAD_PREVIEW___'));
        assert.ok(s.includes('010203'));
        assert.ok(s.includes('abc'));
    });

    test('sanitizeForWebview does not double-prefix payload token', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        );

        const input = {
            x: {
                _type: 'bytes',
                lengthBytes: 1,
                hexPreview: 'aa',
                textPreview: '___CBOR_PAYLOAD_PREVIEW___blob-1|already',
                _hexBlobId: 'blob-1'
            }
        };

        const sanitized = (provider as any).sanitizeForWebview(input);
        const s = JSON.stringify(sanitized);
        assert.ok(s.includes('___CBOR_PAYLOAD_PREVIEW___blob-1|already'));
    });

    test('resolveCustomEditor responds to messages (openHexBlob/openTextBlob/decodeAsCbor/setViewMode)', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const blobId = 'blob-1';
        const blobs = new Map<string, Buffer>([[blobId, Buffer.from([0x01, 0x02])]]);
        const decodedViews = {
            pretty: { payload: { bytes: { _type: 'bytes', lengthBytes: 2, hexPreview: '0102', _hexBlobId: blobId, textPreview: 'hi' } } },
            raw: { raw: true },
            blobs
        };

        // Bypass file IO for unit test.
        provider.decodeDocument = async () => decodedViews;

        let onMessage: ((m: any) => any) | undefined;
        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (cb: any) => { onMessage = cb; return { dispose() {} }; },
            postMessage: async (_msg: any) => true,
            html: ''
        };

        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;

        await provider.resolveCustomEditor(document, panel, {});
        assert.ok(typeof webview.html === 'string' && webview.html.includes('<!DOCTYPE html>'));
        assert.ok(onMessage);

        await onMessage!({ type: 'openHexBlob', blobId });
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args[1] === 'hexEditor.hexedit'));

        await onMessage!({ type: 'openTextBlob', blobId });
        assert.ok(state.shownTextDocuments.length >= 1);

        // decodeAsCbor hex
        await onMessage!({ type: 'decodeAsCbor', kind: 'hex', hex: '0102' });
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args[1] === 'cborViewer.editor'));

        // decodeAsCbor blobId success
        state.executedCommands.length = 0;
        await onMessage!({ type: 'decodeAsCbor', kind: 'blobId', blobId });
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args[1] === 'cborViewer.editor'));

        // decodeAsCbor byteArray success
        state.executedCommands.length = 0;
        await onMessage!({ type: 'decodeAsCbor', kind: 'byteArray', bytes: [1, 2, 3] });
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args[1] === 'cborViewer.editor'));

        // decodeAsCbor stringBase64 success (AQID => 0x010203)
        state.executedCommands.length = 0;
        await onMessage!({ type: 'decodeAsCbor', kind: 'stringBase64', value: 'AQID' });
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args[1] === 'cborViewer.editor'));

        // setViewMode
        await onMessage!({ type: 'setViewMode', mode: 'raw' });
    });

    test('resolveCustomEditor ping handshake catch path is covered when postMessage throws', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        provider.decodeDocument = async () => ({ pretty: { ok: true }, raw: { ok: true }, blobs: new Map() });

        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (_cb: any) => ({ dispose() {} }),
            postMessage: async (_msg: any) => { throw new Error('nope'); },
            html: ''
        };
        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;

        await provider.resolveCustomEditor(document, panel, {});
        // Allow the setTimeout(0) to run.
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    test('resolveCustomEditor handles error/edge message branches', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const blobs = new Map<string, Buffer>([['blob-1', Buffer.from([0x01])]]);
        provider.decodeDocument = async () => ({ pretty: { ok: true }, raw: { ok: false }, blobs });

        let onMessage: ((m: any) => any) | undefined;
        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (cb: any) => { onMessage = cb; return { dispose() {} }; },
            postMessage: async (_msg: any) => true,
            html: ''
        };
        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;

        await provider.resolveCustomEditor(document, panel, {});
        assert.ok(onMessage);

        // webviewLog + pong should not throw
        await onMessage!({ type: 'webviewLog', level: 'info', message: 'hi' });
        await onMessage!({ type: 'webviewLog', level: 'warn', message: 'warn' });
        await onMessage!({ type: 'webviewLog', level: 'error', message: 'err' });
        await onMessage!({ type: 'pong', t: 1 });

        // openHexBlob missing id / missing blob
        state.executedCommands.length = 0;
        await onMessage!({ type: 'openHexBlob' });
        await onMessage!({ type: 'openHexBlob', blobId: 'missing' });
        assert.strictEqual(state.executedCommands.length, 0);

        // openTextBlob missing id / missing blob
        state.executedCommands.length = 0;
        await onMessage!({ type: 'openTextBlob' });
        await onMessage!({ type: 'openTextBlob', blobId: 'missing' });
        assert.strictEqual(state.executedCommands.length, 0);

        // decodeAsCbor missing fields / unknown kind => early returns
        await onMessage!({ type: 'decodeAsCbor' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'hex' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'stringBase64' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'byteArray' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'blobId' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'unknownKind' });

        // decodeAsCbor invalid inputs
        state.errorMessages.length = 0;
        await onMessage!({ type: 'decodeAsCbor', kind: 'hex', hex: 'not-hex' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'stringBase64', value: '!!!' });
        await onMessage!({ type: 'decodeAsCbor', kind: 'byteArray', bytes: [1, 2, 999] });
        assert.ok(state.errorMessages.some(m => m.includes('Invalid hex') || m.includes('base64') || m.includes('Byte array')));

        // decodeAsCbor blobId missing
        state.errorMessages.length = 0;
        await onMessage!({ type: 'decodeAsCbor', kind: 'blobId', blobId: 'missing' });
        assert.ok(state.errorMessages.some(m => m.includes('Blob not found')));

        // setViewMode invalid
        await onMessage!({ type: 'setViewMode', mode: 'nope' });

        // unknown message ignored
        await onMessage!({ type: 'unknown' });
    });

    test('setViewMode returns early when decodedViews is missing', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        provider.decodeDocument = async () => {
            throw new Error('boom');
        };

        let onMessage: ((m: any) => any) | undefined;
        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (cb: any) => { onMessage = cb; return { dispose() {} }; },
            postMessage: async (_msg: any) => true,
            html: ''
        };

        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;
        await provider.resolveCustomEditor(document, panel, {});
        assert.ok(onMessage);

        await onMessage!({ type: 'setViewMode', mode: 'raw' });
    });

    test('resolveCustomEditor renders error HTML when decode fails', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        provider.decodeDocument = async () => {
            throw new Error('boom');
        };

        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (_cb: any) => ({ dispose() {} }),
            postMessage: async (_msg: any) => true,
            html: ''
        };
        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;

        await provider.resolveCustomEditor(document, panel, {});
        assert.ok(String(webview.html).includes('Error'));
        assert.ok(String(webview.html).includes('boom'));
    });

    test('decodeDocument uses full-buffer decode for small files', async () => {
        const { vscode, state } = createVscodeMock();
        // Very large threshold so we always use readFile() path.
        state.configuration['cborViewer.streamingThresholdMiB'] = 10_000;
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const fixture = path.resolve(__dirname, '../../../test/fixtures/simple.cbor');
        const uri = (vscode as any).Uri.file(fixture);
        const views = await provider.decodeDocument(uri);
        assert.ok(views.pretty);
        assert.ok(views.raw);
    });

    test('decodeDocument streams large local files when above threshold', async () => {
        const { vscode, state } = createVscodeMock();
        // Threshold of 1 byte forces streaming for any non-empty file.
        // (decodeDocument only streams when thresholdBytes > 0)
        state.configuration['cborViewer.streamingThresholdMiB'] = 0.000001;
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const fixture = path.resolve(__dirname, '../../../test/fixtures/simple.cbor');
        const uri = (vscode as any).Uri.file(fixture);
        const views = await provider.decodeDocument(uri);
        assert.ok(views.pretty);
        assert.ok(views.raw);
    });

    test('decodeDocument does not stream when thresholdMiB is 0', async () => {
        const { vscode, state } = createVscodeMock();
        state.configuration['cborViewer.streamingThresholdMiB'] = 0;
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        // If streaming were chosen, this would throw.
        provider.decodeLargeFileStream = async () => {
            throw new Error('streaming should not be used');
        };

        const fixture = path.resolve(__dirname, '../../../test/fixtures/simple.cbor');
        const uri = (vscode as any).Uri.file(fixture);
        const views = await provider.decodeDocument(uri);
        assert.ok(views.pretty);
        assert.ok(views.raw);
    });

    test('decodeDocument falls back to readFile for non-file scheme even when large', async () => {
        const { vscode, state } = createVscodeMock();
        state.configuration['cborViewer.streamingThresholdMiB'] = 0.000001;
        mockRequire('vscode', vscode);

        // Override workspace.fs to avoid actual file IO for the virtual scheme.
        const fixture = path.resolve(__dirname, '../../../test/fixtures/simple.cbor');
        const bytes = require('fs').readFileSync(fixture);
        (vscode as any).workspace.fs.stat = async () => ({ type: 1, ctime: 0, mtime: 0, size: 10_000_000 });
        (vscode as any).workspace.fs.readFile = async () => new Uint8Array(bytes);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const uri = (vscode as any).Uri.parse('mem:/virtual.cbor');
        const views = await provider.decodeDocument(uri);
        assert.ok(views.pretty);
        assert.ok(views.raw);
    });

    test('decodeLargeFileStream rejects on invalid/truncated CBOR', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const fixture = path.resolve(__dirname, '../../../test/fixtures/large-bytes-512k.cbor');
        const uri = (vscode as any).Uri.file(fixture);
        await assert.rejects(async () => provider.decodeLargeFileStream(uri));
    });

    test('decodeLargeFileStream rejects on stream error (missing file)', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        const uri = (vscode as any).Uri.file(path.resolve(__dirname, '../../../test/fixtures/does-not-exist.cbor'));
        await assert.rejects(async () => provider.decodeLargeFileStream(uri));
    });

    test('provider helper parsers cover edge cases', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        assert.strictEqual(provider.tryParseHex('0x0'), undefined);
        assert.strictEqual(provider.tryParseHex('zz'), undefined);
        const emptyHex = provider.tryParseHex('');
        assert.ok(emptyHex);
        assert.strictEqual((emptyHex as Uint8Array).length, 0);
        const wsHex = provider.tryParseHex('   ');
        assert.ok(wsHex);
        assert.strictEqual((wsHex as Uint8Array).length, 0);

        assert.strictEqual(provider.tryDecodeBase64ToBytes('@@@'), undefined);
        assert.strictEqual(provider.tryDecodeBase64ToBytes('A'), undefined);
        assert.strictEqual(provider.tryDecodeBase64ToBytes('===='), undefined);
        const emptyB64 = provider.tryDecodeBase64ToBytes('');
        assert.ok(emptyB64);
        assert.strictEqual((emptyB64 as Uint8Array).length, 0);

        const okArr = provider.tryDecodeByteArray([0, 255]);
        assert.ok(okArr);
        assert.strictEqual((okArr as Uint8Array).length, 2);

        assert.strictEqual(provider.tryDecodeByteArray([1, 2, 999]), undefined);

        const nonce = provider.getNonce();
        assert.strictEqual(typeof nonce, 'string');
        assert.strictEqual(nonce.length, 32);
    });

    test('decodeAsCbor shows error when open fails', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        // Force createUri to throw.
        (mem as any).createUri = () => { throw new Error('nope'); };

        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        provider.decodeDocument = async () => ({ pretty: { ok: true }, raw: { ok: true }, blobs: new Map() });

        let onMessage: ((m: any) => any) | undefined;
        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (cb: any) => { onMessage = cb; return { dispose() {} }; },
            postMessage: async (_msg: any) => true,
            html: ''
        };
        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;

        await provider.resolveCustomEditor(document, panel, {});
        await onMessage!({ type: 'decodeAsCbor', kind: 'hex', hex: '0102' });
        assert.ok(state.errorMessages.some(m => m.includes('Failed to open decoded CBOR')));
    });

    test('resolveCustomEditor ignores non-object messages', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../inMemoryFileSystem');
        const { CborEditorProvider } = mockRequire.reRequire('../../cborEditorProvider');

        const mem = new InMemoryFileSystemProvider('cborViewerMem');
        const provider = new CborEditorProvider(
            { extensionUri: (vscode as any).Uri.parse('file:/ext') } as any,
            mem
        ) as any;

        provider.decodeDocument = async () => ({ pretty: { ok: true }, raw: { ok: true }, blobs: new Map() });

        let onMessage: ((m: any) => any) | undefined;
        const webview = {
            options: {},
            cspSource: 'vscode-webview://test',
            asWebviewUri: (u: any) => u,
            onDidReceiveMessage: (cb: any) => { onMessage = cb; return { dispose() {} }; },
            postMessage: async (_msg: any) => true,
            html: ''
        };
        const panel = { webview } as any;
        const document = { uri: (vscode as any).Uri.parse('file:/x.cbor') } as any;

        await provider.resolveCustomEditor(document, panel, {});
        await onMessage!('not-an-object');
        await onMessage!(null);
    });
});
