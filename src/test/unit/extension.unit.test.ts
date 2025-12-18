import * as assert from 'assert';
import mockRequire from 'mock-require';
import { createVscodeMock } from './vscodeMock';

suite('Unit: extension activation + commands', () => {
    teardown(() => {
        mockRequire.stopAll();
    });

    test('activate registers FS provider, custom editor, and commands', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const extension = mockRequire.reRequire('../../extension');

        const context = { subscriptions: [] as any[] };
        extension.activate(context as any);

        assert.ok(state.registeredFileSystems.some(s => s.scheme === 'cborViewerMem'));
        assert.ok(state.registeredCustomEditors.some(e => e.viewType === 'cborViewer.editor'));

        assert.ok(state.registeredCommands.has('cborViewer.openHex'));
        assert.ok(state.registeredCommands.has('cborViewer.decodeSelectionAsCbor'));

        // Disposables pushed
        assert.ok(context.subscriptions.length >= 3);
    });

    test('openHex uses vscode.openWith hex editor for active editor uri', async () => {
        const { vscode, state } = createVscodeMock();
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: true },
            document: {
                uri: (vscode as any).Uri.parse('file:/x.cbor'),
                getText: () => ''
            }
        };
        mockRequire('vscode', vscode);

        const extension = mockRequire.reRequire('../../extension');
        const context = { subscriptions: [] as any[] };
        extension.activate(context as any);

        const handler = state.registeredCommands.get('cborViewer.openHex');
        assert.ok(handler);

        await handler!();

        const call = state.executedCommands.find(c => c.command === 'vscode.openWith');
        assert.ok(call);
        assert.strictEqual(call!.args[1], 'hexEditor.hexedit');
    });

    test('openHex uses provided uri when passed', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const extension = mockRequire.reRequire('../../extension');
        const context = { subscriptions: [] as any[] };
        extension.activate(context as any);

        const handler = state.registeredCommands.get('cborViewer.openHex');
        assert.ok(handler);

        await handler!((vscode as any).Uri.parse('file:/explicit.cbor'));
        const call = state.executedCommands.find(c => c.command === 'vscode.openWith');
        assert.ok(call);
        assert.ok(String(call!.args[0]).includes('explicit.cbor'));
    });

    test('openHex does nothing when no active editor and no uri', async () => {
        const { vscode, state } = createVscodeMock();
        (vscode as any).window.activeTextEditor = undefined;
        mockRequire('vscode', vscode);

        const extension = mockRequire.reRequire('../../extension');
        const context = { subscriptions: [] as any[] };
        extension.activate(context as any);

        const handler = state.registeredCommands.get('cborViewer.openHex');
        assert.ok(handler);
        await handler!();
        assert.ok(!state.executedCommands.some(c => c.command === 'vscode.openWith'));
    });

    test('decodeSelectionAsCbor decodes hex/base64/json-array and opens in viewer', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const extension = mockRequire.reRequire('../../extension');
        const context = { subscriptions: [] as any[] };
        extension.activate(context as any);

        const handler = state.registeredCommands.get('cborViewer.decodeSelectionAsCbor');
        assert.ok(handler);

        const run = async (text: string) => {
            state.executedCommands.length = 0;
            state.errorMessages.length = 0;
            state.infoMessages.length = 0;

            (vscode as any).window.activeTextEditor = {
                selection: { isEmpty: false },
                document: {
                    uri: (vscode as any).Uri.parse('file:/doc.txt'),
                    getText: () => text
                }
            };

            await handler!();
            const open = state.executedCommands.find(c => c.command === 'vscode.openWith');
            assert.ok(open, `Expected openWith for input: ${text}`);
            assert.strictEqual(open!.args[1], 'cborViewer.editor');
        };

        await run('0x010203');
        await run('010203');
        await run('[1,2,3]');

        // base64 for 0x010203
        await run('AQID');
        // base64 with whitespace/newlines
        await run('A Q\nI\tD');
        // base64url variant ("_" chars) for 0xFFFFFF
        await run('____');
    });

    test('decodeSelectionAsCbor decodes base64 with whitespace and padding variants', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const ext = mockRequire.reRequire('../../extension');
        const context = { subscriptions: [] as any[] };
        ext.activate(context as any);

        const handler = state.registeredCommands.get('cborViewer.decodeSelectionAsCbor');
        assert.ok(handler);

        // Base64 length %4 === 2 => adds '==' ("TQ" => "M")
        state.executedCommands.length = 0;
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: false },
            document: {
                uri: (vscode as any).Uri.parse('file:/doc.txt'),
                getText: () => '  T Q\n'
            }
        };
        await handler!();
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));

        // Base64 length %4 === 3 => adds '=' ("TWE" => "Ma")
        state.executedCommands.length = 0;
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: false },
            document: {
                uri: (vscode as any).Uri.parse('file:/doc.txt'),
                getText: () => 'TWE'
            }
        };
        await handler!();
        assert.ok(state.executedCommands.some(c => c.command === 'vscode.openWith' && c.args?.[1] === 'cborViewer.editor'));
    });

    test('decodeSelectionAsCbor shows messages for missing/invalid selection', async () => {
        const { vscode, state } = createVscodeMock();
        mockRequire('vscode', vscode);

        const extension = mockRequire.reRequire('../../extension');
        const context = { subscriptions: [] as any[] };
        extension.activate(context as any);

        const handler = state.registeredCommands.get('cborViewer.decodeSelectionAsCbor');
        assert.ok(handler);

        // no editor
        (vscode as any).window.activeTextEditor = undefined;
        await handler!();
        assert.strictEqual(state.infoMessages.length, 0);
        assert.strictEqual(state.errorMessages.length, 0);

        // empty selection
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: true },
            document: { uri: (vscode as any).Uri.parse('file:/doc'), getText: () => '' }
        };
        await handler!();
        assert.ok(state.infoMessages.some(m => m.includes('Select')));

        // invalid selection
        (vscode as any).window.activeTextEditor = {
            selection: { isEmpty: false },
            document: { uri: (vscode as any).Uri.parse('file:/doc'), getText: () => 'not base64!!!' }
        };
        await handler!();
        assert.ok(state.errorMessages.some(m => m.includes('Selection is not recognized')));
    });

    test('deactivate does not throw', async () => {
        const { vscode } = createVscodeMock();
        mockRequire('vscode', vscode);
        const extension = mockRequire.reRequire('../../extension');
        assert.doesNotThrow(() => extension.deactivate());
    });
});
