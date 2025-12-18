import * as assert from 'assert';
import { decodeCbor } from '../../cborDecoder';
import * as cbor from 'cbor';

suite('CBOR Decoder Test Suite', () => {
    test('Should decode simple CBOR object', async () => {
        const testObject = { name: 'John', age: 30, active: true };
        const encoded = cbor.encodeOne(testObject);
        const decoded = await decodeCbor(new Uint8Array(encoded));

        assert.strictEqual(decoded.name, 'John');
        assert.strictEqual(decoded.age, 30);
        assert.strictEqual(decoded.active, true);
    });

    test('Should decode CBOR array', async () => {
        const testArray = [1, 2, 3, 4, 5];
        const encoded = cbor.encodeOne(testArray);
        const decoded = await decodeCbor(new Uint8Array(encoded));

        assert.deepStrictEqual(decoded, testArray);
    });

    test('Should decode CBOR with nested objects', async () => {
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
        const decoded = await decodeCbor(new Uint8Array(encoded));

        assert.strictEqual(decoded.user.name, 'Alice');
        assert.strictEqual(decoded.user.details.age, 25);
        assert.strictEqual(decoded.user.details.city, 'New York');
    });

    test('Should handle CBOR with Buffer values', async () => {
        const testObject = {
            data: Buffer.from('hello'),
            number: 42
        };
        const encoded = cbor.encodeOne(testObject);
        const decoded = await decodeCbor(new Uint8Array(encoded));

        // Buffer should be converted to hex string
        assert.strictEqual(typeof decoded.data, 'string');
        assert.strictEqual(decoded.data, '68656c6c6f');
        assert.strictEqual(decoded.number, 42);
    });

    test('Should throw error for invalid CBOR data', async () => {
        const invalidData = new Uint8Array([0xff, 0xff, 0xff]);
        
        await assert.rejects(
            async () => await decodeCbor(invalidData),
            /Failed to decode CBOR data/
        );
    });

    test('Should detect and parse COSE_Sign1 structure', async () => {
        // Create a COSE_Sign1-like structure
        const protectedHeaders = cbor.encodeOne({ alg: 'ES256' });
        const unprotectedHeaders = { kid: 'key-1' };
        const payload = Buffer.from('test payload');
        const signature = Buffer.from('fake-signature');

        const coseSign1 = [protectedHeaders, unprotectedHeaders, payload, signature];
        const encoded = cbor.encodeOne(coseSign1);
        const decoded = await decodeCbor(new Uint8Array(encoded));

        assert.strictEqual(decoded._type, 'COSE_Sign1');
        assert.ok(decoded.protected);
        assert.ok(decoded.unprotected);
        assert.ok(decoded.payload);
        assert.ok(decoded.signature);
    });
});
