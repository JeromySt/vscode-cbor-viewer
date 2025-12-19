import * as assert from 'assert';
import { decodeCbor } from '../../cborDecoder';
import * as cbor from 'cbor';
import * as fs from 'fs';
import * as path from 'path';

suite('CBOR Decoder Test Suite', () => {
    test('Should decode simple CBOR object', () => {
        const testObject = { name: 'John', age: 30, active: true };
        const encoded = cbor.encodeOne(testObject);
        const decoded = decodeCbor(new Uint8Array(encoded)) as Record<string, unknown>;

        assert.strictEqual(decoded.name, 'John');
        assert.strictEqual(decoded.age, 30);
        assert.strictEqual(decoded.active, true);
    });

    test('Should decode CBOR array', () => {
        const testArray = [1, 2, 3, 4, 5];
        const encoded = cbor.encodeOne(testArray);
        const decoded = decodeCbor(new Uint8Array(encoded));

        assert.deepStrictEqual(decoded, testArray);
    });

    test('Should decode CBOR with nested objects', () => {
        const testObject = {
            user: {
                name: 'Alice',
                details: {
                    age: 25,
                    city: 'New York'
                }
            }
        };
        const encoded = cbor.encodeOne(testObject);
        const decoded = decodeCbor(new Uint8Array(encoded)) as Record<string, Record<string, Record<string, unknown>>>;

        assert.strictEqual(decoded.user.name, 'Alice');
        assert.strictEqual(decoded.user.details.age, 25);
        assert.strictEqual(decoded.user.details.city, 'New York');
    });

    test('Should handle CBOR with Buffer values', () => {
        const testObject = {
            data: Buffer.from('hello'),
            number: 42
        };
        const encoded = cbor.encodeOne(testObject);
        const decoded = decodeCbor(new Uint8Array(encoded)) as Record<string, unknown>;

        // Buffer should be rendered as a compact bytes preview object
        assert.strictEqual(typeof decoded.data, 'object');
        assert.ok(decoded.data);
        const data = decoded.data as any;
        assert.strictEqual(data._type, 'bytes');
        assert.strictEqual(data.lengthBytes, 5);
        assert.strictEqual(typeof data.hexPreview, 'string');
        assert.ok(String(data.hexPreview).startsWith('68656c6c6f'));
        assert.strictEqual(decoded.number, 42);
    });

    test('Should throw error for invalid CBOR data', () => {
        const invalidData = new Uint8Array([0xff, 0xff, 0xff]);
        
        assert.throws(
            () => decodeCbor(invalidData),
            /Failed to decode CBOR data/
        );
    });

    test('Should detect and parse COSE_Sign1 structure', () => {
        // Embed a COSE_Sign1 inside an array (as scitt-statement does).
        const innerProtectedMap = new Map<number, unknown>([[1, -7]]);
        const innerProtected = cbor.encodeOne(innerProtectedMap);
        const innerSign1 = [innerProtected, new Map(), Buffer.from('p'), Buffer.from('s')];
        const innerTagged = new (cbor as any).Tagged(18, innerSign1);
        const innerBytes = cbor.encodeOne(innerTagged);

        // Create a COSE_Sign1-like structure using numeric header labels (RFC 9052)
        // protected = { 1: -7 (ES256), 3: "text/plain", 15: { 1: "issuer", 6: 1700000000 }, 34: [-44, h'01020304'], 9001: "hello" }
        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [3, 'text/plain'],
            [15, new Map<number, unknown>([
                [1, 'issuer'],
                [6, 1700000000],
                [999, new Map<number, unknown>([
                    [1, 'x'],
                    [2, Buffer.from([0xde, 0xad, 0xbe, 0xef])]
                ])]
            ])],
            [34, [-44, Buffer.from([1, 2, 3, 4])]],
            [394, [innerBytes]],
            [9001, 'hello']
        ]);
        const protectedHeaders = cbor.encodeOne(protectedMap);

        const unprotectedHeaders = new Map<number, unknown>([
            [4, Buffer.from('kid-1')]
        ]);

        const payload = Buffer.from('test payload');
        const signature = Buffer.from('fake-signature');

        const coseSign1 = [protectedHeaders, unprotectedHeaders, payload, signature];
        const encoded = cbor.encodeOne(new (cbor as any).Tagged(18, coseSign1));
        const decoded = decodeCbor(new Uint8Array(encoded)) as any;

        assert.ok(decoded.protectedHeaders);
        assert.ok(decoded.signature);

        assert.strictEqual(decoded.protectedHeaders.algorithm.id, -7);
        assert.ok(String(decoded.protectedHeaders.algorithm.name).includes('ES256'));
        assert.strictEqual(decoded.protectedHeaders.contentType, 'text/plain');

        assert.ok(decoded.protectedHeaders.certificateThumbprint);
        assert.strictEqual(decoded.protectedHeaders.certificateThumbprint.algorithm, 'SHA-512');
        assert.strictEqual(decoded.protectedHeaders.certificateThumbprint.value, '01020304');

        assert.ok(decoded.protectedHeaders && decoded.protectedHeaders['15']);
        assert.strictEqual(decoded.protectedHeaders['15'].labelId, 15);
        assert.strictEqual(decoded.protectedHeaders['15'].valueType, 'map');
        assert.ok(decoded.protectedHeaders['15'].value);
        assert.strictEqual(decoded.protectedHeaders['15'].value.issuer, 'issuer');
        assert.strictEqual(decoded.protectedHeaders['15'].value.issuedAtUnix, 1700000000);
        assert.strictEqual(decoded.protectedHeaders['15'].value.customClaimsCount, 1);
        assert.ok(Array.isArray(decoded.protectedHeaders['15'].value.customClaims));
        assert.strictEqual(decoded.protectedHeaders['15'].value.customClaims.length, 1);
        assert.strictEqual(decoded.protectedHeaders['15'].value.customClaims[0].labelId, 999);
        assert.ok(decoded.protectedHeaders['15'].value.customClaims[0].value);

        assert.ok(decoded.payload);
        assert.strictEqual(decoded.payload.isEmbedded, true);
        assert.ok(decoded.payload.bytes);
        assert.strictEqual(decoded.payload.bytes._type, 'bytes');
        assert.strictEqual(decoded.payload.isText, true);
        assert.ok(String(decoded.payload.bytes.textPreview).includes('test payload'));

        assert.ok(decoded.protectedHeaders['394']);
        assert.strictEqual(decoded.protectedHeaders['394'].labelId, 394);

        const scittStatement = decoded.protectedHeaders['394'];
        assert.ok(scittStatement);
        assert.strictEqual(scittStatement.valueType, 'array');
        assert.ok(Array.isArray(scittStatement.value));
        assert.ok(scittStatement.value[0]);
        assert.ok(scittStatement.value[0].signature);
    });

    test('Should decode real-world COSE/CBOR fixtures', () => {
        const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

        const files = [
            '2ts-statement.scitt.cose',
            'datatrails-mmr.receipt.cbor'
        ];

        for (const filename of files) {
            const filePath = path.join(fixturesDir, filename);
            const bytes = fs.readFileSync(filePath);

            const decoded = decodeCbor(new Uint8Array(bytes)) as any;

            // Should be stringifyable for the webview.
            assert.doesNotThrow(() => JSON.stringify(decoded));

            // Both fixtures are tagged COSE_Sign1 (tag 18) and should produce inspection-style output.
            assert.ok(decoded);
            assert.ok(decoded.signature);
            assert.strictEqual(decoded.signature.totalSizeBytes, bytes.length);
        }
    });
});
