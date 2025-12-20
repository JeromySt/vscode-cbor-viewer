/**
 * @fileoverview Selection Decoders.unit.test (tests).
 *
 * - Test coverage for CBOR Viewer behaviors.
 * - Prefer intent-revealing fixtures and assertions over duplicating implementation details.
 * - Keep failures actionable: assert on user-visible output shapes when possible.
 */
import * as assert from 'assert';

suite('Unit: selectionDecoders', () => {
    test('tryDecodeSelectionToBytes supports json byte arrays, hex, and base64url', async () => {
        const { tryDecodeSelectionToBytes } = require('../../preview/selectionDecoders');

        // Empty
        assert.strictEqual(tryDecodeSelectionToBytes(''), undefined);

        // JSON byte array
        const fromJson = tryDecodeSelectionToBytes('[1, 2, 3]');
        assert.ok(fromJson);
        assert.deepStrictEqual(Array.from(fromJson!), [1, 2, 3]);

        // JSON but not byte array
        assert.strictEqual(tryDecodeSelectionToBytes('{"a":1}'), undefined);
        assert.strictEqual(tryDecodeSelectionToBytes('[1, -1]'), undefined);

        // Hex: odd length invalid
        assert.strictEqual(tryDecodeSelectionToBytes('0xabc'), undefined);

        // Invalid (neither hex nor base64)
        assert.strictEqual(tryDecodeSelectionToBytes('0xzz$'), undefined);

        // Strip quotes
        const quotedHex = tryDecodeSelectionToBytes('"010203"');
        assert.ok(quotedHex);
        assert.deepStrictEqual(Array.from(quotedHex!), [1, 2, 3]);

        // Hex: valid with whitespace
        const fromHex = tryDecodeSelectionToBytes('01 02 03');
        assert.ok(fromHex);
        assert.deepStrictEqual(Array.from(fromHex!), [1, 2, 3]);

        // Hex: empty string after stripping yields empty bytes
        const emptyHex = tryDecodeSelectionToBytes('0x');
        assert.ok(emptyHex);
        assert.strictEqual(emptyHex!.length, 0);

        // Base64url: AQID => 0x010203
        const fromB64Url = tryDecodeSelectionToBytes('AQID');
        assert.ok(fromB64Url);
        assert.deepStrictEqual(Array.from(fromB64Url!), [1, 2, 3]);

        // Base64url chars: '_' is mapped to '/'
        const fromB64Url2 = tryDecodeSelectionToBytes('____');
        assert.ok(fromB64Url2);
        assert.ok(fromB64Url2!.length > 0);

        // Base64 with whitespace and padding variants
        const fromB64Whitespace = tryDecodeSelectionToBytes('AQI D\n');
        assert.ok(fromB64Whitespace);
        assert.deepStrictEqual(Array.from(fromB64Whitespace!), [1, 2, 3]);

        // Base64 invalid pattern
        assert.strictEqual(tryDecodeSelectionToBytes('@@@'), undefined);

        // JSON parse error returns undefined
        assert.strictEqual(tryDecodeSelectionToBytes('{bad'), undefined);

        // Base64 invalid length mod 4 == 1
        assert.strictEqual(tryDecodeSelectionToBytes('A'), undefined);
    });
});
