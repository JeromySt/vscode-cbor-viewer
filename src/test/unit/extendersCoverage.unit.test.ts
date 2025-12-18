import * as assert from 'assert';
import mockRequire from 'mock-require';
import * as fs from 'fs';
import * as path from 'path';

import { createVscodeMock } from './vscodeMock';

suite('Unit: extender loaders + preview extenders coverage', () => {
    teardown(() => {
        mockRequire.stopAll();
    });

    test('preview extenders: openHexBlob/openTextBlob/decodeAsCbor branches', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { PreviewSystem } = mockRequire.reRequire('../../preview/previewSystem');
        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../preview/inMemoryFileSystem');

        const { previewExtender: openHexBlobExt } = mockRequire.reRequire('../../preview/extenders/openHexBlob/extender');
        const { previewExtender: openTextBlobExt } = mockRequire.reRequire('../../preview/extenders/openTextBlob/extender');
        const { previewExtender: decodeAsCborExt } = mockRequire.reRequire('../../preview/extenders/decodeAsCbor/extender');

        const system = new PreviewSystem();
        openHexBlobExt.register(system);
        openTextBlobExt.register(system);
        decodeAsCborExt.register(system);

        const memFs = new InMemoryFileSystemProvider('mem');
        const blobs = new Map<string, Buffer>();
        blobs.set('blob-1', Buffer.from([0x01, 0x02, 0x03]));

        // openHexBlob: missing blobId
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'openHexBlob' }, { memFs, blobs }),
            true
        );
        assert.ok(!state.executedCommands.some(c => c.command === 'vscode.openWith'));

        // openHexBlob: missing bytes
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'openHexBlob', blobId: 'missing' }, { memFs, blobs }),
            true
        );
        assert.ok(!state.executedCommands.some(c => c.command === 'vscode.openWith'));

        // openHexBlob: success
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'openHexBlob', blobId: 'blob-1' }, { memFs, blobs }),
            true
        );
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'hexEditor.hexedit'));

        // openTextBlob: missing blobId
        state.shownTextDocuments.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'openTextBlob' }, { memFs, blobs }),
            true
        );

        // openTextBlob: missing bytes
        state.shownTextDocuments.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'openTextBlob', blobId: 'missing' }, { memFs, blobs }),
            true
        );
        assert.strictEqual(state.shownTextDocuments.length, 0);

        // openTextBlob: success
        state.shownTextDocuments.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'openTextBlob', blobId: 'blob-1' }, { memFs, blobs }),
            true
        );
        assert.strictEqual(state.shownTextDocuments.length, 1);

        // decodeAsCbor: missing kind
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor' }, { memFs, blobs }),
            true
        );

        // decodeAsCbor: unknown kind => not handled
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'nope' }, { memFs, blobs }),
            false
        );

        // decodeAsCbor: blobId missing blobId
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'blobId' }, { memFs, blobs }),
            true
        );

        // decodeAsCbor: blobId not found
        state.errorMessages.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'blobId', blobId: 'missing' }, { memFs, blobs }),
            true
        );
        assert.ok(state.errorMessages.some(m => m.includes('Blob not found')));

        // decodeAsCbor: hex missing
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'hex' }, { memFs, blobs }),
            true
        );

        // decodeAsCbor: hex invalid
        state.errorMessages.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'hex', hex: 'zz' }, { memFs, blobs }),
            true
        );
        assert.ok(state.errorMessages.some(m => m.includes('Invalid hex')));

        // decodeAsCbor: base64 kind missing value
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'stringBase64' }, { memFs, blobs }),
            true
        );

        // decodeAsCbor: base64 invalid
        state.errorMessages.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'stringBase64', value: '@@@' }, { memFs, blobs }),
            true
        );
        assert.ok(state.errorMessages.some(m => m.includes('base64')));

        // decodeAsCbor: byteArray kind missing bytes
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'byteArray' }, { memFs, blobs }),
            true
        );

        // decodeAsCbor: byteArray invalid
        state.errorMessages.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'byteArray', bytes: [1, 999] }, { memFs, blobs }),
            true
        );
        assert.ok(state.errorMessages.some(m => m.includes('0..255')));

        // decodeAsCbor: successful open from blob
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'blobId', blobId: 'blob-1' }, { memFs, blobs }),
            true
        );
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));

        // decodeAsCbor: successful open from hex
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'hex', hex: '010203' }, { memFs, blobs }),
            true
        );
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));

        // decodeAsCbor: successful open from base64
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'stringBase64', value: 'AQID' }, { memFs, blobs }),
            true
        );
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));

        // decodeAsCbor: successful open from byteArray
        state.executedCommands.length = 0;
        assert.strictEqual(
            await system.handleWebviewMessage({ type: 'decodeAsCbor', kind: 'byteArray', bytes: [1, 2, 3] }, { memFs, blobs }),
            true
        );
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));
    });

    test('preview extenders: openHexCommand + decodeSelectionCommand branches', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { PreviewSystem } = mockRequire.reRequire('../../preview/previewSystem');
        const { InMemoryFileSystemProvider } = mockRequire.reRequire('../../preview/inMemoryFileSystem');

        const { previewExtender: openHexCommandExt } = mockRequire.reRequire('../../preview/extenders/openHexCommand/extender');
        const { previewExtender: decodeSelectionCommandExt } = mockRequire.reRequire('../../preview/extenders/decodeSelectionCommand/extender');

        const system = new PreviewSystem();
        openHexCommandExt.register(system);
        decodeSelectionCommandExt.register(system);

        const memFs = new InMemoryFileSystemProvider('mem');
        const extensionContext = { subscriptions: [] as any[] };
        system.activateCommands(extensionContext as any, memFs);

        const openHex = state.registeredCommands.get('cborViewer.openHex');
        assert.ok(openHex);

        // openHex: no uri and no active editor => early return
        (vscode as any).window.activeTextEditor = undefined;
        state.executedCommands.length = 0;
        await openHex!();
        assert.ok(!state.executedCommands.some(c => c.command === 'vscode.openWith'));

        // openHex: active editor uri
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: true },
            document: {
                uri: (vscode as any).Uri.parse('file:/from-editor.cbor'),
                getText: () => ''
            }
        };
        state.executedCommands.length = 0;
        await openHex!();
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'hexEditor.hexedit'));

        // openHex: explicit uri
        state.executedCommands.length = 0;
        await openHex!((vscode as any).Uri.parse('file:/explicit.cbor'));
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && String(c.args?.[0]).includes('explicit.cbor')));

        const decodeSelection = state.registeredCommands.get('cborViewer.decodeSelectionAsCbor');
        assert.ok(decodeSelection);

        // decodeSelection: no editor => early return
        (vscode as any).window.activeTextEditor = undefined;
        state.executedCommands.length = 0;
        state.infoMessages.length = 0;
        state.errorMessages.length = 0;
        await decodeSelection!();
        assert.strictEqual(state.infoMessages.length, 0);
        assert.strictEqual(state.errorMessages.length, 0);

        // decodeSelection: empty selection => info message
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: true },
            document: {
                uri: (vscode as any).Uri.parse('file:/doc.txt'),
                getText: () => ''
            }
        };
        state.infoMessages.length = 0;
        await decodeSelection!();
        assert.ok(state.infoMessages.some(m => m.includes('Select base64')));

        // decodeSelection: invalid selection => error message
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: false },
            document: {
                uri: (vscode as any).Uri.parse('file:/doc.txt'),
                getText: () => 'not base64!!!'
            }
        };
        state.errorMessages.length = 0;
        await decodeSelection!();
        assert.ok(state.errorMessages.some(m => m.includes('Selection is not recognized')));

        // decodeSelection: valid hex selection => opens CBOR viewer
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: false },
            document: {
                uri: (vscode as any).Uri.parse('file:/doc.txt'),
                getText: () => '010203'
            }
        };
        state.executedCommands.length = 0;
        await decodeSelection!();
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));
    });

    test('preview extender loader skips hidden/node_modules and ignores invalid extenders', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);

        const { PreviewSystem } = mockRequire.reRequire('../../preview/previewSystem');
        const { registerBuiltInPreviewExtenders } = mockRequire.reRequire('../../preview/extenders/loadBuiltInPreviewExtenders');

        const loaderFile = require.resolve('../../preview/extenders/loadBuiltInPreviewExtenders');
        const extendersRoot = path.dirname(loaderFile);

        const hiddenDir = path.join(extendersRoot, '.skip-me');
        const nodeModulesDir = path.join(extendersRoot, 'node_modules');
        const invalidDir = path.join(extendersRoot, 'zzzInvalidExtender');

        try {
            fs.mkdirSync(hiddenDir, { recursive: true });
            fs.mkdirSync(nodeModulesDir, { recursive: true });
            fs.mkdirSync(invalidDir, { recursive: true });

            // invalid: previewExtender exists but has wrong shape
            fs.writeFileSync(
                path.join(invalidDir, 'extender.js'),
                "exports.previewExtender = { id: 123, register: 5 };\n",
                'utf8'
            );

            const system = new PreviewSystem();
            assert.doesNotThrow(() => registerBuiltInPreviewExtenders(system));
        } finally {
            try {
                fs.rmSync(hiddenDir, { recursive: true, force: true });
                fs.rmSync(nodeModulesDir, { recursive: true, force: true });
                fs.rmSync(invalidDir, { recursive: true, force: true });
            } catch {
                // ignore
            }
        }
    });

    test('pretty extender loader skips non-extender dirs and throws for invalid extender module', async () => {
        // These modules are type-heavy; we still want them required at least once
        // so they are not reported as never-loaded.
        mockRequire.reRequire('../../pretty/previewHints');
        mockRequire.reRequire('../../pretty/core/bytesTypes');
        mockRequire.reRequire('../../pretty/core/valueTypes');
        mockRequire.reRequire('../../pretty/extenders/prettyExtender');
        mockRequire.reRequire('../../preview/extenders/previewExtender');
        mockRequire.reRequire('../../pretty/extenders/certificates/coseCertificateTypes');
        mockRequire.reRequire('../../pretty/extenders/coseSign1/coseSign1InspectionTypes');
        mockRequire.reRequire('../../pretty/extenders/cwtClaims/cwtClaimsTypes');
        mockRequire.reRequire('../../pretty/bytesPreview');

        const { PrettyFormatterRegistry } = mockRequire.reRequire('../../pretty/registry');
        const { LabelRegistry } = mockRequire.reRequire('../../pretty/labels/labelRegistry');
        const { PreviewGeneratorRegistry } = mockRequire.reRequire('../../pretty/previews/previewGeneratorRegistry');
        const { registerBuiltInExtenders } = mockRequire.reRequire('../../pretty/extenders/loadBuiltInExtenders');

        const loaderFile = require.resolve('../../pretty/extenders/loadBuiltInExtenders');
        const extendersRoot = path.dirname(loaderFile);

        const skipDir = path.join(extendersRoot, 'zzzSkipDir');
        const invalidDir = path.join(extendersRoot, 'zzzInvalidPrettyExtender');

        try {
            fs.mkdirSync(skipDir, { recursive: true });

            fs.mkdirSync(invalidDir, { recursive: true });
            fs.writeFileSync(
                path.join(invalidDir, 'extender.js'),
                "exports.prettyExtender = { id: 123, register: 5 };\n",
                'utf8'
            );

            const registry = new PrettyFormatterRegistry();
            const labels = new LabelRegistry();
            const previews = new PreviewGeneratorRegistry();

            assert.throws(() => registerBuiltInExtenders(registry as any, labels as any, previews as any));
        } finally {
            try {
                fs.rmSync(skipDir, { recursive: true, force: true });
                fs.rmSync(invalidDir, { recursive: true, force: true });
            } catch {
                // ignore
            }
        }
    });

    test('selectionDecoders and messageDecoders cover edge branches', async () => {
        const { tryDecodeSelectionToBytes } = mockRequire.reRequire('../../preview/selectionDecoders');
        const { tryDecodeBase64ToBytes } = mockRequire.reRequire('../../preview/messageDecoders');

        // quoted hex
        assert.deepStrictEqual(Array.from(tryDecodeSelectionToBytes("'0x0A0B'") ?? []), [0x0a, 0x0b]);
        assert.deepStrictEqual(Array.from(tryDecodeSelectionToBytes('"0A0B"') ?? []), [0x0a, 0x0b]);

        // JSON parse with object should not be treated as byte array
        assert.strictEqual(tryDecodeSelectionToBytes('{"a":1}'), undefined);

        // base64 length % 4 === 1 is invalid
        assert.strictEqual(tryDecodeBase64ToBytes('A'), undefined);

        // base64 with invalid chars is rejected
        assert.strictEqual(tryDecodeBase64ToBytes('@@@'), undefined);

        // hex with odd length is rejected (selectionDecoders path)
        assert.strictEqual(tryDecodeSelectionToBytes('0xABC'), undefined);
    });

    test('PrettyFormatterRegistry returns value when empty', async () => {
        const { PrettyFormatterRegistry } = mockRequire.reRequire('../../pretty/registry');
        const registry = new PrettyFormatterRegistry();
        const out = registry.format(
            123,
            {
                depth: 0,
                maxDepth: 1,
                format: (v: unknown) => v,
                formatAtDepthLimit: (v: unknown) => v,
                tryDecodeEmbedded: () => undefined,
                bytesPreview: () => ({ _type: 'bytes', lengthBytes: 0, _hexBlobId: 'x' }),
                labels: {
                    getCoseHeaderName: () => 'x',
                    getCwtClaimName: () => 'y'
                }
            } as any
        );
        assert.strictEqual(out, 123);
    });
});
