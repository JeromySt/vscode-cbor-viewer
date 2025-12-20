/**
 * @fileoverview Bytes Preview Generator.unit.test (tests).
 *
 * - Test coverage for CBOR Viewer behaviors.
 * - Prefer intent-revealing fixtures and assertions over duplicating implementation details.
 * - Keep failures actionable: assert on user-visible output shapes when possible.
 */
import * as assert from 'assert';

suite('Unit: BytesPreviewGenerator', () => {
    test('generate returns hex preview and text preview (or undefined)', async () => {
        const { BytesPreviewGenerator } = require('../../pretty/extenders/generic/bytesPreviewGenerator');

        const blobs = new Map<string, any>();
        blobs.set('b1', Buffer.from('hello world', 'utf8'));
        blobs.set('b2', Buffer.from([0xff, 0x00, 0xfe, 0x01]));
        blobs.set('b3', Buffer.alloc(64, 0x61));

        const ctx: any = { blobs };

        // Missing blob
        assert.strictEqual(BytesPreviewGenerator.generate('hex', { blobId: 'missing' }, null, ctx), undefined);

        // Hex preview without suffix
        const hex1 = BytesPreviewGenerator.generate('hex', { blobId: 'b2' }, null, ctx);
        assert.ok(typeof hex1 === 'string' && hex1.length > 0);
        assert.ok(!hex1.includes('...'));

        // Hex preview with suffix (long buffer)
        const hex2 = BytesPreviewGenerator.generate('hex', { blobId: 'b3' }, null, ctx);
        assert.ok(typeof hex2 === 'string' && hex2.includes('...'));

        // Text preview for utf8
        const txt = BytesPreviewGenerator.generate('text', { blobId: 'b1' }, null, ctx);
        assert.strictEqual(txt, 'hello world');

        // Non-text returns undefined
        assert.strictEqual(BytesPreviewGenerator.generate('text', { blobId: 'b2' }, null, ctx), undefined);

        // Unknown kind returns undefined
        assert.strictEqual(BytesPreviewGenerator.generate('nope', { blobId: 'b1' }, null, ctx), undefined);
    });
});
