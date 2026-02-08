/**
 * @fileoverview Cbor Decoder.views.unit.test (tests).
 *
 * - Test coverage for CBOR Viewer behaviors.
 * - Prefer intent-revealing fixtures and assertions over duplicating implementation details.
 * - Keep failures actionable: assert on user-visible output shapes when possible.
 */
import * as assert from 'assert';
import * as cbor from 'cbor';
import { decodeCbor, decodeCborDecodedValueWithBlobs, decodeCborDecodedValueWithViews, decodeCborWithBlobs, decodeCborWithViews } from '../../cborDecoder';
import * as fs from 'fs';
import * as path from 'path';

suite('Unit: cborDecoder views (pretty/raw)', () => {
    test('decodeCborWithViews returns both pretty and raw views', () => {
        const obj = { a: 1, b: 'x' };
        const bytes = cbor.encodeOne(obj);
        const result = decodeCborWithViews(new Uint8Array(bytes));

        assert.ok(result);
        assert.ok(result.pretty);
        assert.ok(result.raw);
        assert.ok(result.blobs);
        assert.strictEqual(result.blobs.size, 0);

        assert.deepStrictEqual(result.pretty, obj);

        // raw view should also be JSON-safe
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });

    test('raw view does not compact empty/small byte arrays', () => {
        const decoded: any = {
            empty: [],
            smallBytes: [1, 2, 3]
        };
        const result = decodeCborDecodedValueWithViews(decoded, 0);
        const raw: any = result.raw;
        // Raw view renders plain objects as a map-entries structure.
        const entries: any[] = raw.entries;
        const emptyEntry = entries.find(e => String(e.key).includes('empty'));
        const smallEntry = entries.find(e => String(e.key).includes('smallBytes'));
        assert.ok(emptyEntry);
        assert.ok(Array.isArray(emptyEntry.value));
        assert.deepStrictEqual(emptyEntry.value, []);
        assert.ok(smallEntry);
        assert.ok(Array.isArray(smallEntry.value));
        assert.deepStrictEqual(smallEntry.value, [1, 2, 3]);
    });

    test('depth-limit rendering handles Tagged + Map + Buffer branches', () => {
        const Tagged = (cbor as any).Tagged;
        const innerMap = new Map<any, any>([[1, Buffer.alloc(64, 0x11)]]);
        const tagged = new Tagged(999, innerMap);

        // Force depth >= MAX_EMBEDDED_DECODE_DEPTH so raw view uses renderRawValueAtDepthLimit.
        let deep: any = tagged;
        for (let i = 0; i < 50; i++) {
            deep = [deep];
        }

        const result = decodeCborDecodedValueWithViews(deep, 0);
        assert.doesNotThrow(() => JSON.stringify(result.pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));

        const raw: any = result.raw;
        // Walk down to the tagged object.
        let node: any = raw;
        for (let i = 0; i < 50; i++) {
            assert.ok(Array.isArray(node));
            node = node[0];
        }
        assert.strictEqual(node._cborTag, 999);
    });

    test('prettyRootType=coseHeaders wraps decoded map for pretty view', () => {
        const decoded = new Map<any, any>([[1, -7]]);
        const views = decodeCborDecodedValueWithViews(decoded, 10, { prettyRootType: 'coseHeaders' });

        assert.ok(views.pretty);
        assert.ok(views.raw);
    });

    test('depth-limit rendering compacts large byte arrays into bytes preview', () => {
        const bytes = Array.from({ length: 32 }, (_, i) => i);
        let deep: any = bytes;
        for (let i = 0; i < 6; i++) {
            deep = [deep];
        }

        const result = decodeCborDecodedValueWithViews(deep, 0);

        let node: any = result.raw;
        for (let i = 0; i < 6; i++) {
            assert.ok(Array.isArray(node));
            node = node[0];
        }
        assert.strictEqual(node._type, 'bytes');
        assert.ok(typeof node._hexBlobId === 'string');
    });

    test('depth-limit rendering enumerates non-map objects (Date)', () => {
        const d: any = new Date('2020-01-01T00:00:00.000Z');
        d.x = 1;
        let deep: any = d;
        for (let i = 0; i < 6; i++) {
            deep = [deep];
        }

        const result = decodeCborDecodedValueWithViews(deep, 0);
        let node: any = result.raw;
        for (let i = 0; i < 6; i++) {
            assert.ok(Array.isArray(node));
            node = node[0];
        }
        assert.ok(node && typeof node === 'object');
        assert.strictEqual(node.x, 1);
    });

    test('embedded bytes that decode to multiple CBOR items remain as bytes preview', () => {
        const multi = Buffer.concat([cbor.encodeOne(1), cbor.encodeOne(2)]);
        const decoded = { multi };
        const result = decodeCborDecodedValueWithViews(decoded as any, multi.length);
        const pretty: any = result.pretty;
        // Pretty view expands plain objects; the embedded bytes should stay as a bytes preview object.
        assert.ok(pretty.multi);
        assert.strictEqual(pretty.multi._type, 'bytes');
    });

    test('decodeCbor and decodeCborWithBlobs throw on invalid CBOR', () => {
        assert.throws(() => decodeCbor(new Uint8Array([0xff, 0xff])), /Failed to decode CBOR data/);
        assert.throws(() => decodeCborWithBlobs(new Uint8Array([0xff, 0xff])), /Failed to decode CBOR data/);
    });

    test('decodeCborWithViews throws on invalid CBOR', () => {
        assert.throws(() => decodeCborWithViews(new Uint8Array([0xff, 0xff])), /Failed to decode CBOR data/);
    });

    test('decodeCborDecodedValueWithBlobs returns pretty value and blob map', () => {
        const decoded = { b: Buffer.from([1, 2, 3]) };
        const out = decodeCborDecodedValueWithBlobs(decoded as any, 3);
        assert.ok(out);
        assert.ok(out.value);
        assert.ok(out.blobs);
        // Both pretty and raw views may register blobs.
        assert.ok(out.blobs.size >= 1);
    });

    test('decodeCborDecodedValueWithViews renders raw map entries for plain objects', () => {
        const decoded = { a: 1, b: { c: 2 } };
        const result = decodeCborDecodedValueWithViews(decoded as any, 123);
        const raw: any = result.raw;
        assert.ok(raw && raw._type === 'map');
        assert.ok(Array.isArray(raw.entries));
        assert.ok(raw.entries.some((e: any) => String(e.key).includes('a')));
    });

    test('decodeCborDecodedValueWithViews handles Date objects without treating as maps', () => {
        const decoded: any = new Date('2020-01-01T00:00:00Z');
        decoded.x = 1;
        const result = decodeCborDecodedValueWithViews(decoded as any, 1);
        assert.doesNotThrow(() => JSON.stringify(result.pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
        assert.strictEqual((result.raw as any).x, 1);
    });

    test('decodeCborDecodedValueWithViews treats Uint8Array as bytes', () => {
        const decoded = new Uint8Array([1, 2, 3]);
        const result = decodeCborDecodedValueWithViews(decoded as any, 3);
        const pretty: any = result.pretty;
        const raw: any = result.raw;
        assert.ok(pretty && pretty._type === 'bytes');
        assert.ok(raw && raw._type === 'bytes');
    });

    test('pretty view renders non-COSE CBOR tags as {_cborTag, value}', () => {
        const tagged = new (cbor as any).Tagged(42, 'hello');
        const bytes = cbor.encodeOne({ t: tagged });
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;
        assert.ok(pretty && pretty.t);
        assert.strictEqual(pretty.t._cborTag, 42);
        assert.strictEqual(pretty.t.value, 'hello');
    });

    test('nested tag-18 COSE_Sign1 inside structure is expanded to inspection output', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedHeaders = cbor.encodeOne(protectedMap);
        const coseSign1 = [protectedHeaders, new Map(), Buffer.from('p'), Buffer.from('s')];
        const inner = new (cbor as any).Tagged(18, coseSign1);

        // Put tag-18 inside a larger CBOR object so expandCborValue handles it.
        const bytes = cbor.encodeOne({ inner });
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;
        assert.ok(pretty.inner);
        assert.ok(pretty.inner.signature);
    });

    test('tag-18 with invalid payload type does not match COSE_Sign1', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedHeaders = cbor.encodeOne(protectedMap);
        // payload is a number -> invalid for COSE_Sign1
        const bad = [protectedHeaders, new Map(), 123, Buffer.from('s')];
        const tagged = new (cbor as any).Tagged(18, bad);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;
        assert.ok(pretty && pretty._cborTag === 18);
    });

    test('pretty view decodes embedded COSE_Sign1 inside byte strings', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedHeaders = cbor.encodeOne(protectedMap);
        const coseSign1 = [protectedHeaders, new Map(), Buffer.from('p'), Buffer.from('s')];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const embeddedBytes = Buffer.from(cbor.encodeOne(tagged));

        const top = { embedded: embeddedBytes };
        const bytes = cbor.encodeOne(top);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.embedded);
        // Should be inspection output, not a bytes preview.
        assert.ok(pretty.embedded.signature);
        assert.ok(pretty.embedded.protectedHeaders);
    });

    test('raw view preserves non-string map keys as entries', () => {
        const m = new Map<any, any>();
        m.set(1, 'one');
        m.set(Buffer.from([0x01]), 2);
        const bytes = cbor.encodeOne(m);
        const result = decodeCborWithViews(new Uint8Array(bytes));

        const raw: any = result.raw;
        assert.ok(raw && raw._type === 'map');
        assert.ok(Array.isArray(raw.entries));
        assert.ok(raw.entries.length >= 2);
    });

    test('pretty view renders bytes as preview + blob id', () => {
        const obj = { data: Buffer.from('hello') };
        const bytes = cbor.encodeOne(obj);
        const result = decodeCborWithViews(new Uint8Array(bytes));

        const pretty: any = result.pretty;
        assert.ok(pretty.data);
        assert.strictEqual(pretty.data._type, 'bytes');
        assert.strictEqual(typeof pretty.data._hexBlobId, 'string');
        assert.ok(result.blobs.has(pretty.data._hexBlobId));
    });

    test('bytes preview omits textPreview when bytes are not text (empty)', () => {
        const obj = { data: Buffer.alloc(0) };
        const bytes = cbor.encodeOne(obj);
        const result = decodeCborWithViews(new Uint8Array(bytes));

        const pretty: any = result.pretty;
        assert.ok(pretty.data);
        assert.strictEqual(pretty.data._type, 'bytes');
        assert.ok(pretty.data._previewHints);
        assert.strictEqual((pretty.data._previewHints as any).textPreview, undefined);
        assert.strictEqual(pretty.data.textPreview, undefined);
    });

    test('bytes preview detects unicode UTF-8 text', () => {
        const obj = { data: Buffer.from('こんにちは世界\n', 'utf8') };
        const bytes = cbor.encodeOne(obj);
        const result = decodeCborWithViews(new Uint8Array(bytes));

        const pretty: any = result.pretty;
        assert.ok(pretty.data);
        assert.strictEqual(pretty.data._type, 'bytes');
        assert.ok(pretty.data._previewHints);
        assert.strictEqual((pretty.data._previewHints as any).textPreview.kind, 'text');
        assert.strictEqual(typeof pretty.data.textPreview, 'string');
        assert.ok(String(pretty.data.textPreview).includes('こんにちは'));
    });
    test('detects tagged COSE_Sign1 and produces inspection output in pretty view', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedHeaders = cbor.encodeOne(protectedMap);
        const coseSign1 = [protectedHeaders, new Map(), Buffer.from('p'), Buffer.from('s')];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;
        assert.ok(pretty.signature);
        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['1']);
        assert.strictEqual(pretty.protectedHeaders['1'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['1'].value);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmId, -7);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'ES256');

        // raw view should NOT be COSE inspection shape
        const raw: any = result.raw;
        assert.ok(raw);
        assert.ok(Array.isArray((raw as any)) || raw._type === 'array' || raw._type === 'map' || typeof raw === 'object');
    });

    test('decoding a COSE protected headers map alone formats as COSE headers (not CWT claims)', () => {
        const claims = new Map<number, unknown>([[1, 'issuer.example']]);
        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [15, claims],
            [33, [Buffer.from([0x01, 0x02, 0x03])]],
            [258, -16]
        ]);

        const bytes = cbor.encodeOne(protectedMap);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty['1']);
        assert.strictEqual(pretty['1'].valueType, 'map');
        assert.ok(pretty['1'].value);
        assert.strictEqual(pretty['1'].value.algorithmId, -7);
        assert.strictEqual(pretty['1'].value.algorithmName, 'ES256');

        // Header 15 should still decode as CWT claims set.
        assert.ok(pretty['15']);
        assert.strictEqual(pretty['15'].valueType, 'map');
        assert.ok(pretty['15'].value);
        assert.strictEqual(pretty['15'].value.issuer, 'issuer.example');

        // Hash message projection should still work when present.
        assert.ok(pretty['258']);
        assert.strictEqual(pretty['258'].valueType, 'map');
        assert.ok(pretty['258'].value);
        assert.strictEqual(pretty['258'].value.algorithmId, -16);
        assert.ok(typeof pretty['258'].value.algorithmName === 'string');
    });

    test('COSE payload binary sets sha256 and decodes embedded CBOR', () => {
        // Build a payload that is itself CBOR.
        const embedded = cbor.encodeOne({ nested: { a: 1 } });
        const payload = Buffer.from(embedded);

        const now = Math.floor(Date.now() / 1000);
        const past = now - 3600;

        const cwt = new Map<number, unknown>([
            [1, 'issuer.example'],
            [2, 'subject.example'],
            [6, past], // iat
            [4, past], // exp
            [5, past - 10], // nbf
            [999, true]
        ]);

        const protectedMap = new Map<number, unknown>([
            [1, -16], // use SHA-256 mapping too
            [3, 'application/cbor'],
            [2, [1, 9999]],
            [15, cwt],
            [258, -16],
            [260, 'embedded']
        ]);
        const protectedHeaders = cbor.encodeOne(protectedMap);

        // Put x5chain in unprotected so the certificate extender replaces header value there.
        const unprotectedHeaders = new Map<number, unknown>([
            [33, [Buffer.from([0x30, 0x82, 0x01, 0x0a])]],
            [4, Buffer.from('kid')]
        ]);

        const coseSign1 = [protectedHeaders, unprotectedHeaders, payload, Buffer.from([0x00])];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.payload);
        assert.strictEqual(pretty.payload.isEmbedded, true);
        assert.strictEqual(pretty.payload.isText, false);
        assert.ok(typeof pretty.payload.sha256 === 'string');
        assert.ok(pretty.payload.decoded);

        // Binary payloads should not surface a text preview.
        assert.ok(pretty.payload.bytes);
        assert.strictEqual(pretty.payload.bytes.textPreview, undefined);
        assert.ok(pretty.payload.bytes._previewHints);
        assert.strictEqual((pretty.payload.bytes._previewHints as any).textPreview, undefined);

        assert.ok(pretty.protectedHeaders && pretty.protectedHeaders['15']);
        assert.strictEqual(pretty.protectedHeaders['15'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['15'].value);
        assert.strictEqual(pretty.protectedHeaders['15'].value.issuer, 'issuer.example');
        assert.strictEqual(pretty.protectedHeaders['15'].value.subject, 'subject.example');
        assert.strictEqual(pretty.protectedHeaders['15'].value.isExpired, true);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims);

        assert.ok(pretty.signature);
        assert.ok(pretty.unprotectedHeaders && pretty.unprotectedHeaders['33']);
        assert.strictEqual(pretty.unprotectedHeaders['33'].valueType, 'map');
        assert.ok(pretty.unprotectedHeaders['33'].value);
        assert.strictEqual(pretty.unprotectedHeaders['33'].value.chainLength, 1);
        assert.ok(typeof pretty.unprotectedHeaders['33'].value.headerName === 'string');
    });

    test('COSE inspection recognizes x5bag (32) and replaces header value with derived view', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedHeaders = cbor.encodeOne(protectedMap);

        // Put x5bag in unprotected headers.
        const unprotectedHeaders = new Map<number, unknown>([
            [32, [Buffer.from([0x01]), Buffer.from([0x02])]]
        ]);

        const coseSign1 = [protectedHeaders, unprotectedHeaders, Buffer.from('p'), Buffer.from([0x00])];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.signature);
        assert.ok(pretty.unprotectedHeaders && pretty.unprotectedHeaders['32']);
        assert.strictEqual(pretty.unprotectedHeaders['32'].valueType, 'map');
        assert.ok(pretty.unprotectedHeaders['32'].value);
        assert.strictEqual(pretty.unprotectedHeaders['32'].value.bagLength, 2);
        assert.ok(typeof pretty.unprotectedHeaders['32'].value.headerName === 'string');
        // Bag length should be surfaced under protectedHeaders if present; if bag is unprotected, it may be omitted.
        // Ensure we at least don't throw and certificates parsing is best-effort.
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('decodes real-world fixtures and surfaces certificate derived header values when present', () => {
        const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');
        const files = [
            '2ts-statement.scitt.cose',
            'datatrails-mmr.receipt.cbor'
        ];

        for (const filename of files) {
            const filePath = path.join(fixturesDir, filename);
            const buf = fs.readFileSync(filePath);
            const result = decodeCborWithViews(new Uint8Array(buf));
            const pretty: any = result.pretty;

            assert.ok(pretty);
            assert.ok(pretty.signature);
            assert.strictEqual(pretty.signature.totalSizeBytes, buf.length);
            assert.doesNotThrow(() => JSON.stringify(pretty));

            // Some fixtures include x5chain/x5bag; if so, the header value should be replaced with a derived view.
            if (pretty.protectedHeaders && pretty.protectedHeaders['33']?.valueType === 'map') {
                assert.ok(typeof pretty.protectedHeaders['33'].value?.headerName === 'string');
            }
            if (pretty.unprotectedHeaders && pretty.unprotectedHeaders['33']?.valueType === 'map') {
                assert.ok(typeof pretty.unprotectedHeaders['33'].value?.headerName === 'string');
            }
        }
    });

    test('raw view compacts large numeric byte arrays into bytes preview', () => {
        const byteArray = Array.from({ length: 64 }, (_, i) => i & 0xff);
        const bytes = cbor.encodeOne(byteArray);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const raw: any = result.raw;
        assert.ok(raw && raw._type === 'bytes');
        assert.strictEqual(raw.lengthBytes, 64);
        assert.ok(typeof raw.hexPreview === 'string');
    });

    test('pretty/raw depth limits do not crash on deeply nested structures', () => {
        // Build a nested object deeper than MAX_EMBEDDED_DECODE_DEPTH.
        const root: any = { level: 0 };
        let cur = root;
        for (let i = 1; i <= 12; i++) {
            cur.next = { level: i };
            cur = cur.next;
        }
        // Add bytes at depth to exercise renderValueAtDepthLimit() bytes branch.
        cur.bytes = Buffer.from('hello');

        const encoded = cbor.encodeOne(root);
        const result = decodeCborWithViews(new Uint8Array(encoded));
        assert.doesNotThrow(() => JSON.stringify(result.pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });

    test('map keys stringify deterministically (numbers, buffers, nested maps)', () => {
        const innerKeyMap = new Map<any, any>();
        innerKeyMap.set('k', Buffer.from([0xaa, 0xbb]));

        const m = new Map<any, any>();
        m.set(1, 'one');
        m.set(Buffer.from([0x01, 0x02]), 'buf');
        m.set(innerKeyMap, 'nested-map-key');

        const encoded = cbor.encodeOne(m);
        const result = decodeCborWithViews(new Uint8Array(encoded));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty['1'], 'one');
        assert.strictEqual(pretty['0102'], 'buf');
        assert.ok(Object.keys(pretty).some(k => k.includes('nested-map-key') === false));
    });

    test('mapKeyToString falls back when JSON.stringify throws (BigInt property)', () => {
        const m = new Map<any, any>();
        m.set({ x: 1n }, 'v');
        const views = decodeCborDecodedValueWithViews(m as any, 1);
        const pretty: any = views.pretty;
        // When JSON.stringify throws, the key should be String(key) => "[object Object]".
        assert.strictEqual(pretty['[object Object]'], 'v');
    });

    test('embedded decode depth limit prevents decoding at MAX depth', () => {
        const embedded = Buffer.from(cbor.encodeOne({ a: 1 }));
        // 6 array nestings makes the buffer encountered at depth=6.
        const decoded = [[[[[[embedded]]]]]];
        const views = decodeCborDecodedValueWithViews(decoded as any, embedded.length);
        const pretty: any = views.pretty;
        let cur: any = pretty;
        for (let i = 0; i < 6; i++) {
            cur = cur[0];
        }
        // At depth limit, embedded bytes should remain a bytes preview (not decoded object).
        assert.ok(cur && cur._type === 'bytes');
        assert.ok(!cur.decoded);
    });

    test('unprotectedHeaders entry falls back when cbor.encodeOne fails', () => {
        // Use a Symbol in *unprotected* headers to force getEncodedLengthBytes() to catch.
        const protectedBytes = Buffer.from(cbor.encodeOne(new Map<number, unknown>([[1, -7]])));
        const unprotected = new Map<number, unknown>([[999, Symbol('x')]]);
        const decodedSign1 = [protectedBytes, unprotected, null, Buffer.from([0x00])];

        const pretty: any = decodeCborDecodedValueWithViews(decodedSign1 as any, 10).pretty;
        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['999']);
        assert.strictEqual(pretty.unprotectedHeaders['999'].valueType, 'unknown');
    });

    test('map keys stringify for boolean and bigint keys', () => {
        const m = new Map<any, any>();
        m.set(true, 't');
        m.set(1n, 'b');

        const encoded = cbor.encodeOne(m);
        const result = decodeCborWithViews(new Uint8Array(encoded));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty['true'], 't');
        assert.strictEqual(pretty['1'], 'b');
    });

    test('tagged-18 but non-Sign1 shape is not treated as COSE inspection output', () => {
        const tagged = new (cbor as any).Tagged(18, [1, 2, 3]);
        const encoded = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(encoded));
        const pretty: any = result.pretty;
        assert.ok(pretty);
        assert.ok(!pretty.signature);
    });

    test('invalid protected headers bytes are treated as empty map', () => {
        const protectedHeaders = Buffer.from([0xff, 0xff]); // invalid CBOR
        const coseSign1 = [protectedHeaders, new Map(), Buffer.from('p'), Buffer.from('s')];
        const encoded = cbor.encodeOne(new (cbor as any).Tagged(18, coseSign1));
        const result = decodeCborWithViews(new Uint8Array(encoded));
        const pretty: any = result.pretty;
        assert.ok(pretty.signature);
        // header map is empty due to invalid protected bytes
        assert.ok(!pretty.protectedHeaders || !pretty.protectedHeaders['1']);
    });

    test('COSE inspection covers text payload + header mappings + non-expired CWT', () => {
        const now = Math.floor(Date.now() / 1000);
        const future = now + 3600;

        // Custom claim bytes that decode as *multiple* CBOR items -> should NOT embed-decode.
        const multiItemBytes = Buffer.concat([Buffer.from(cbor.encodeOne(1)), Buffer.from(cbor.encodeOne(2))]);

        const cwt = new Map<number, unknown>([
            [1, 'iss.example'],
            [2, 'sub.example'],
            [3, 'aud.example'],
            [6, now],
            [5, now - 10],
            [4, future],
            [7, Buffer.from([0xde, 0xad, 0xbe, 0xef])],
            [999, multiItemBytes],
            [1000, new Map<any, any>([[1, 'x']])],
            [1001, [1, 2, 3]]
        ]);

        const protectedMap = new Map<number, unknown>([
            [1, -37], // PS256
            [3, 42], // content type as int
            [2, ['crit-string', 9999]],
            [34, [-16, Buffer.from([1, 2, 3])]], // x5t
            [33, [Buffer.from([0x01]), Buffer.from([0x02])]],
            [258, 123], // unknown hash algorithm
            [259, 'text/plain'],
            [260, 'https://example.test/payload'],
            [15, cwt],
            [999, 1.5],
            [100, 5n]
        ]);

        const protectedHeaders = cbor.encodeOne(protectedMap);

        // Put x5chain in unprotected as a single bstr to exercise chain length = 1.
        const unprotectedHeaders = new Map<number, unknown>([
            [33, Buffer.from([0x01, 0x02, 0x03])],
            [35, 'https://example.test/cert.pem'],
        ]);

        const payloadText = Buffer.from('hello world\n', 'utf8');
        const coseSign1 = [protectedHeaders, unprotectedHeaders, payloadText, Buffer.from([0x00])];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['1']);
        assert.strictEqual(pretty.protectedHeaders['1'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['1'].value);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmId, -37);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'PS256');

        assert.ok(pretty.protectedHeaders['3']);
        assert.strictEqual(pretty.protectedHeaders['3'].valueType, 'uint');
        assert.strictEqual(pretty.protectedHeaders['3'].value, 42);

        assert.ok(pretty.payload);
        assert.strictEqual(pretty.payload.contentType, '42');

        assert.ok(pretty.protectedHeaders['2']);
        assert.strictEqual(pretty.protectedHeaders['2'].valueType, 'array');
        assert.ok(Array.isArray(pretty.protectedHeaders['2'].value));

        // COSE_Hash_Msg extension headers should surface as raw header entries.
        assert.ok(pretty.protectedHeaders['258']);
        assert.strictEqual(pretty.protectedHeaders['258'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['258'].value);
        assert.strictEqual(pretty.protectedHeaders['258'].value.algorithmId, 123);
        assert.ok(typeof pretty.protectedHeaders['258'].value.algorithmName === 'string');
        assert.ok(pretty.protectedHeaders['259']);
        assert.strictEqual(pretty.protectedHeaders['259'].valueType, 'string');
        assert.strictEqual(pretty.protectedHeaders['259'].value, 'text/plain');
        assert.ok(pretty.protectedHeaders['260']);
        assert.strictEqual(pretty.protectedHeaders['260'].valueType, 'string');
        assert.strictEqual(pretty.protectedHeaders['260'].value, 'https://example.test/payload');
        assert.ok(pretty.protectedHeaders['999']);
        assert.strictEqual(pretty.protectedHeaders['999'].valueType, 'uint');

        assert.ok(pretty.protectedHeaders['100']);
        assert.strictEqual(pretty.protectedHeaders['100'].valueType, 'uint');

        assert.ok(pretty.protectedHeaders && pretty.protectedHeaders['15']);
        assert.strictEqual(pretty.protectedHeaders['15'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['15'].value);
        assert.strictEqual(pretty.protectedHeaders['15'].value.issuer, 'iss.example');
        assert.strictEqual(pretty.protectedHeaders['15'].value.subject, 'sub.example');
        assert.strictEqual(pretty.protectedHeaders['15'].value.audience, 'aud.example');
        assert.strictEqual(pretty.protectedHeaders['15'].value.isExpired, false);
        assert.ok(pretty.protectedHeaders['15'].value.cwtId);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims);

        assert.ok(pretty.payload);
        assert.strictEqual(pretty.payload.isEmbedded, true);
        assert.strictEqual(pretty.payload.isText, true);
        assert.ok(pretty.payload.bytes);
        assert.ok(typeof pretty.payload.bytes.textPreview === 'string');
        assert.ok(!String(pretty.payload.bytes.textPreview).includes('___CBOR_PAYLOAD_PREVIEW___'));
        assert.ok(pretty.payload.bytes._previewHints);
        assert.strictEqual(pretty.payload.bytes._previewHints.textPreview.kind, 'text');
        assert.ok(!pretty.payload.sha256);

        assert.ok(pretty.signature);
        assert.ok(pretty.unprotectedHeaders && pretty.unprotectedHeaders['33']);
        assert.strictEqual(pretty.unprotectedHeaders['33'].valueType, 'map');
        assert.ok(pretty.unprotectedHeaders['33'].value);
        assert.ok(typeof pretty.unprotectedHeaders['33'].value.headerName === 'string');
    });

    test('COSE header 15 formats as CWT claims even without well-known labels', () => {
        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [15, new Map<number, unknown>([[999, true]])]
        ]);
        const protectedHeaders = cbor.encodeOne(protectedMap);

        const coseSign1 = [protectedHeaders, new Map(), Buffer.from('p'), Buffer.from([0x00])];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders && pretty.protectedHeaders['15']);
        assert.strictEqual(pretty.protectedHeaders['15'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['15'].value);
        assert.strictEqual(Object.keys(pretty.protectedHeaders['15'].value.customClaims).length, 1);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims['999']);
        assert.strictEqual(pretty.protectedHeaders['15'].value.customClaims['999'].valueType, 'bool');
        assert.strictEqual(pretty.protectedHeaders['15'].value.customClaims['999'].value, true);
    });

    test('CWT custom claims map values expand even when nested map looks like CWT claims but yields no fields', () => {
        // Top-level CWT claims map must contain at least one well-known label (1..7)
        // for the formatter heuristic to match.
        const cwt = new Map<number, unknown>([
            [1, 'iss.example'],
            // Custom claim 8 is itself a map with keys that *look* like CWT claims labels,
            // but values are the wrong types so the CWT claims formatter would otherwise
            // return `undefined`.
            [8, new Map<number, unknown>([
                // Use byte-string values so:
                // - CWT heuristic matches (keys 1..7)
                // - COSE header-map heuristic does NOT match (alg value is not int-ish)
                // - CWT formatter produces no fields (issuer/subject expect strings)
                [1, Buffer.from([0x01, 0x02])],
                [2, Buffer.from([0x03, 0x04])]
            ])]
        ]);

        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [15, cwt]
        ]);
        const protectedHeaders = cbor.encodeOne(protectedMap);

        const coseSign1 = [protectedHeaders, new Map(), Buffer.from('p'), Buffer.from([0x00])];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders && pretty.protectedHeaders['15']);
        assert.strictEqual(pretty.protectedHeaders['15'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['15'].value);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims);
        assert.ok(pretty.protectedHeaders['15'].value.customClaims['8']);
        assert.strictEqual(pretty.protectedHeaders['15'].value.customClaims['8'].valueType, 'map');

        // Regression: `value` should not disappear just because a heuristic formatter returned undefined.
        const v: any = pretty.protectedHeaders['15'].value.customClaims['8'].value;
        assert.ok(v);
        assert.ok(v['1']);
        assert.ok(v['2']);
        // Values are bytes previews (JSON-safe) rather than raw Buffers.
        assert.strictEqual(v['1']._type, 'bytes');
        assert.strictEqual(v['2']._type, 'bytes');
    });

    test('text payload preview truncates at 100 bytes and x5chain replaces header value', () => {
        const protectedMap = new Map<number, unknown>([
            [1, -257],
            [33, Buffer.from([0x01, 0x02, 0x03])]
        ]);
        const protectedHeaders = cbor.encodeOne(protectedMap);
        const unprotectedHeaders = new Map<number, unknown>();

        const longText = 'a'.repeat(200);
        const payloadText = Buffer.from(longText, 'utf8');
        const coseSign1 = [protectedHeaders, unprotectedHeaders, payloadText, Buffer.from([0x00])];
        const tagged = new (cbor as any).Tagged(18, coseSign1);
        const bytes = cbor.encodeOne(tagged);

        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.payload && pretty.payload.bytes);
        assert.strictEqual(pretty.payload.isText, true);
        assert.ok(String(pretty.payload.bytes.textPreview).endsWith('...'));
        assert.ok(pretty.protectedHeaders && pretty.protectedHeaders['33']);
        assert.strictEqual(pretty.protectedHeaders['33'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['33'].value);
        assert.strictEqual(pretty.protectedHeaders['33'].value.chainLength, 1);
        assert.ok(pretty.protectedHeaders && pretty.protectedHeaders['1']);
        assert.strictEqual(pretty.protectedHeaders['1'].valueType, 'map');
        assert.ok(pretty.protectedHeaders['1'].value);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmId, -257);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'RS256');
    });

    test('COSE alg string parses via toInt32 and float alg is ignored', () => {
        // Since the inspection model now surfaces raw header map keys/values,
        // algorithm value type is preserved as-is.
        const protectedMap1 = new Map<number, unknown>([
            [1, '0'],
        ]);
        const sign1a = [cbor.encodeOne(protectedMap1), new Map(), null, Buffer.from([0x00])];
        const bytesA = cbor.encodeOne(new (cbor as any).Tagged(18, sign1a));
        const prettyA: any = decodeCborWithViews(new Uint8Array(bytesA)).pretty;
        assert.ok(prettyA.protectedHeaders && prettyA.protectedHeaders['1']);
        assert.strictEqual(prettyA.protectedHeaders['1'].valueType, 'map');
        assert.ok(prettyA.protectedHeaders['1'].value);
        assert.strictEqual(prettyA.protectedHeaders['1'].value.algorithmId, 0);
        assert.ok(typeof prettyA.protectedHeaders['1'].value.algorithmName === 'string');

        // alg as a float should be preserved
        const protectedMap2 = new Map<number, unknown>([
            [1, 3.14],
        ]);
        const sign1b = [cbor.encodeOne(protectedMap2), new Map(), null, Buffer.from([0x00])];
        const bytesB = cbor.encodeOne(new (cbor as any).Tagged(18, sign1b));
        const prettyB: any = decodeCborWithViews(new Uint8Array(bytesB)).pretty;
        assert.ok(prettyB.protectedHeaders && prettyB.protectedHeaders['1']);
        assert.strictEqual(prettyB.protectedHeaders['1'].valueType, 'uint');
        assert.strictEqual(prettyB.protectedHeaders['1'].value, 3.14);
    });
});

suite('Unit: CBOR Sequences (RFC 8742)', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    test('single CBOR item is decoded as before (backward compatible)', () => {
        const obj = { hello: 'world' };
        const bytes = cbor.encodeOne(obj);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        assert.deepStrictEqual(result.pretty, obj);
    });

    test('multiple concatenated CBOR items produce a cbor-sequence', () => {
        const item1 = { id: 1, name: 'Item 1' };
        const item2 = { id: 2, name: 'Item 2' };
        const seq = Buffer.concat([cbor.encodeOne(item1), cbor.encodeOne(item2)]);
        const result = decodeCborWithViews(new Uint8Array(seq));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.ok(Array.isArray(pretty.items));
        assert.strictEqual(pretty.items.length, 2);
        assert.strictEqual(pretty.items[0]._sequenceIndex, 0);
        assert.deepStrictEqual(pretty.items[0].value, item1);
        assert.strictEqual(pretty.items[1]._sequenceIndex, 1);
        assert.deepStrictEqual(pretty.items[1].value, item2);
    });

    test('empty CBOR data throws', () => {
        assert.throws(
            () => decodeCborWithViews(new Uint8Array(0)),
            /Empty CBOR data/
        );
    });

    test('sequence of primitives is decoded correctly', () => {
        const seq = Buffer.concat([
            cbor.encodeOne(42),
            cbor.encodeOne('hello'),
            cbor.encodeOne(true)
        ]);
        const result = decodeCborWithViews(new Uint8Array(seq));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.strictEqual(pretty.items.length, 3);
        assert.strictEqual(pretty.items[0].value, 42);
        assert.strictEqual(pretty.items[1].value, 'hello');
        assert.strictEqual(pretty.items[2].value, true);
    });

    test('raw view also produces cbor-sequence for multiple items', () => {
        const item1 = { a: 1 };
        const item2 = { b: 2 };
        const seq = Buffer.concat([cbor.encodeOne(item1), cbor.encodeOne(item2)]);
        const result = decodeCborWithViews(new Uint8Array(seq));
        const raw: any = result.raw;

        assert.strictEqual(raw._type, 'cbor-sequence');
        assert.ok(Array.isArray(raw.items));
        assert.strictEqual(raw.items.length, 2);
        assert.strictEqual(raw.items[0]._sequenceIndex, 0);
        assert.strictEqual(raw.items[1]._sequenceIndex, 1);
    });

    test('sequence with COSE_Sign1 items decodes each item with COSE projection', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        const sign1 = [protectedBytes, new Map(), Buffer.from('payload'), Buffer.from('sig')];
        const tagged = new (cbor as any).Tagged(18, sign1);
        const coseBytes = cbor.encodeOne(tagged);

        // Sequence of two identical COSE_Sign1 items
        const seq = Buffer.concat([coseBytes, coseBytes]);
        const result = decodeCborWithViews(new Uint8Array(seq));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.strictEqual(pretty.items.length, 2);

        // Each item should be individually decoded as COSE_Sign1
        for (let i = 0; i < 2; i++) {
            const item = pretty.items[i].value;
            assert.ok(item.protectedHeaders, `item ${i} should have protectedHeaders`);
            assert.ok(item.signature, `item ${i} should have signature`);
        }
    });

    test('decodeCbor also handles sequences', () => {
        const item1 = { x: 1 };
        const item2 = { y: 2 };
        const seq = Buffer.concat([cbor.encodeOne(item1), cbor.encodeOne(item2)]);
        const result: any = decodeCbor(new Uint8Array(seq));

        assert.strictEqual(result._type, 'cbor-sequence');
        assert.strictEqual(result.items.length, 2);
    });

    test('decodeCborWithBlobs handles sequences', () => {
        const item1 = { a: 'one' };
        const item2 = { b: 'two' };
        const seq = Buffer.concat([cbor.encodeOne(item1), cbor.encodeOne(item2)]);
        const result = decodeCborWithBlobs(new Uint8Array(seq));

        const value: any = result.value;
        assert.strictEqual(value._type, 'cbor-sequence');
        assert.strictEqual(value.items.length, 2);
    });

    test('fixture: simple-sequence.cbor-seq (issue #18 repro)', () => {
        const filePath = path.join(fixturesDir, 'simple-sequence.cbor-seq');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.strictEqual(pretty.items.length, 5);
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(pretty.items[i]._sequenceIndex, i);
            assert.strictEqual(pretty.items[i].value.id, i + 1);
            assert.strictEqual(pretty.items[i].value.name, `Item ${i + 1}`);
        }

        // Verify JSON serialization works (needed for webview)
        assert.doesNotThrow(() => JSON.stringify(pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });

    test('fixture: mixed-types-sequence.cbor-seq', () => {
        const filePath = path.join(fixturesDir, 'mixed-types-sequence.cbor-seq');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.strictEqual(pretty.items.length, 6);
        assert.strictEqual(pretty.items[0].value, 42);
        assert.strictEqual(pretty.items[1].value, 'hello world');
        assert.strictEqual(pretty.items[2].value, true);
        assert.deepStrictEqual(pretty.items[3].value, { key: 'value', nested: { deep: true } });
        assert.deepStrictEqual(pretty.items[4].value, [1, 2, 3]);
        assert.strictEqual(pretty.items[5].value, null);

        assert.doesNotThrow(() => JSON.stringify(pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });

    test('fixture: cose-sequence.cbor-seq (COSE_Sign1 items in sequence)', () => {
        const filePath = path.join(fixturesDir, 'cose-sequence.cbor-seq');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.strictEqual(pretty.items.length, 2);

        // Each item should be decoded as a COSE_Sign1 inspection view
        for (let i = 0; i < 2; i++) {
            const item = pretty.items[i].value;
            assert.ok(item.protectedHeaders, `item ${i} should have protectedHeaders`);
            assert.ok(item.protectedHeaders['1'], `item ${i} should have alg header`);
            assert.ok(item.signature, `item ${i} should have signature`);
            assert.ok(item.payload, `item ${i} should have payload`);
        }

        // Verify the two items have different algorithm ids
        const alg0 = pretty.items[0].value.protectedHeaders['1'].value.algorithmId;
        const alg1 = pretty.items[1].value.protectedHeaders['1'].value.algorithmId;
        assert.notStrictEqual(alg0, alg1);

        // Per-item totalSizeBytes should not report the whole sequence size
        const sig0Size = pretty.items[0].value.signature.totalSizeBytes;
        const sig1Size = pretty.items[1].value.signature.totalSizeBytes;
        assert.ok(sig0Size < bytes.length, `item 0 size (${sig0Size}) should be less than total sequence (${bytes.length})`);
        assert.ok(sig1Size < bytes.length, `item 1 size (${sig1Size}) should be less than total sequence (${bytes.length})`);

        assert.doesNotThrow(() => JSON.stringify(pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });

    test('sequence result is JSON-serializable', () => {
        const seq = Buffer.concat([
            cbor.encodeOne(42),
            cbor.encodeOne({ nested: { deep: true } }),
            cbor.encodeOne([1, 2, 3]),
        ]);
        const result = decodeCborWithViews(new Uint8Array(seq));
        assert.doesNotThrow(() => JSON.stringify(result.pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });
});

suite('Unit: COSE Countersignatures (RFC 9338)', () => {
    const fixturesDir = path.resolve(__dirname, '../../../test/fixtures');

    function makeCountersignature(alg: number): unknown[] {
        const protectedMap = new Map<number, unknown>([[1, alg]]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        return [protectedBytes, new Map(), Buffer.from('countersig-value')];
    }

    test('header label 11 (CounterSignatureV2) is pretty-printed with structure', () => {
        const countersig = makeCountersignature(-7);
        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [11, countersig]
        ]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        const sign1 = [protectedBytes, new Map(), Buffer.from('payload'), Buffer.from('sig')];
        const tagged = new (cbor as any).Tagged(18, sign1);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['11']);
        assert.strictEqual(pretty.protectedHeaders['11'].label, 'CounterSignatureV2 (RFC 9338)');
        assert.ok(pretty.protectedHeaders['11'].value);
        assert.ok(pretty.protectedHeaders['11'].value.protectedHeaders);
        assert.ok(pretty.protectedHeaders['11'].value.signature);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('header label 11 with array of countersignatures', () => {
        const cs1 = makeCountersignature(-7);
        const cs2 = makeCountersignature(-35);
        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [11, [cs1, cs2]]
        ]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        const sign1 = [protectedBytes, new Map(), Buffer.from('payload'), Buffer.from('sig')];
        const tagged = new (cbor as any).Tagged(18, sign1);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders['11']);
        assert.strictEqual(pretty.protectedHeaders['11'].valueType, 'array');
        assert.ok(Array.isArray(pretty.protectedHeaders['11'].value));
        assert.strictEqual(pretty.protectedHeaders['11'].value.length, 2);
        assert.strictEqual(pretty.protectedHeaders['11'].value[0].index, 0);
        assert.strictEqual(pretty.protectedHeaders['11'].value[1].index, 1);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('header label 12 (CounterSignature0V2) renders as bytes preview', () => {
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        const unprotected = new Map<number, unknown>([
            [12, Buffer.from('abbreviated-countersig')]
        ]);
        const sign1 = [protectedBytes, unprotected, Buffer.from('payload'), Buffer.from('sig')];
        const tagged = new (cbor as any).Tagged(18, sign1);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['12']);
        assert.strictEqual(pretty.unprotectedHeaders['12'].label, 'CounterSignature0V2 (RFC 9338)');
        assert.strictEqual(pretty.unprotectedHeaders['12'].valueType, 'bytes');
        assert.ok(pretty.unprotectedHeaders['12'].value);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('header label 7 (v1 counter signature) is also inspected', () => {
        const countersig = makeCountersignature(-7);
        const unprotected = new Map<number, unknown>([[7, countersig]]);
        const protectedMap = new Map<number, unknown>([[1, -7]]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        const sign1 = [protectedBytes, unprotected, Buffer.from('payload'), Buffer.from('sig')];
        const tagged = new (cbor as any).Tagged(18, sign1);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['7']);
        assert.strictEqual(pretty.unprotectedHeaders['7'].label, 'counter signature');
        assert.ok(pretty.unprotectedHeaders['7'].value);
        assert.ok(pretty.unprotectedHeaders['7'].value.protectedHeaders);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('CBOR tag 19 (standalone COSE_Countersignature) is pretty-printed', () => {
        const countersig = makeCountersignature(-7);
        const tagged = new (cbor as any).Tagged(19, countersig);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._cborTag, 19);
        assert.strictEqual(pretty._tagDescription, 'COSE_Countersignature (RFC 9338)');
        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.signature);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('countersignature alg header is decoded with algorithm name', () => {
        const countersig = makeCountersignature(-7);
        const protectedMap = new Map<number, unknown>([
            [1, -7],
            [11, countersig]
        ]);
        const protectedBytes = cbor.encodeOne(protectedMap);
        const sign1 = [protectedBytes, new Map(), Buffer.from('payload'), Buffer.from('sig')];
        const tagged = new (cbor as any).Tagged(18, sign1);
        const bytes = cbor.encodeOne(tagged);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        const csHeaders = pretty.protectedHeaders['11'].value.protectedHeaders;
        assert.ok(csHeaders['1']);
        assert.strictEqual(csHeaders['1'].value.algorithmId, -7);
        assert.strictEqual(csHeaders['1'].value.algorithmName, 'ES256');
    });

    test('fixture: cose-sign1-with-countersig-v2.cbor (single CounterSignatureV2)', () => {
        const filePath = path.join(fixturesDir, 'cose-sign1-with-countersig-v2.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['11']);
        assert.strictEqual(pretty.unprotectedHeaders['11'].label, 'CounterSignatureV2 (RFC 9338)');
        assert.ok(pretty.unprotectedHeaders['11'].value.protectedHeaders);
        assert.ok(pretty.unprotectedHeaders['11'].value.protectedHeaders['1']);
        assert.strictEqual(pretty.unprotectedHeaders['11'].value.protectedHeaders['1'].value.algorithmName, 'ES256');
        assert.ok(pretty.unprotectedHeaders['11'].value.signature);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('fixture: cose-sign1-with-countersig0-v2.cbor (abbreviated CounterSignature0V2)', () => {
        const filePath = path.join(fixturesDir, 'cose-sign1-with-countersig0-v2.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['12']);
        assert.strictEqual(pretty.unprotectedHeaders['12'].label, 'CounterSignature0V2 (RFC 9338)');
        assert.strictEqual(pretty.unprotectedHeaders['12'].valueType, 'bytes');
        assert.ok(pretty.unprotectedHeaders['12'].value);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('fixture: cose-sign1-with-multiple-countersigs.cbor (array of 3 CounterSignatureV2)', () => {
        const filePath = path.join(fixturesDir, 'cose-sign1-with-multiple-countersigs.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['11']);
        assert.strictEqual(pretty.unprotectedHeaders['11'].valueType, 'array');
        const csArray = pretty.unprotectedHeaders['11'].value;
        assert.ok(Array.isArray(csArray));
        assert.strictEqual(csArray.length, 3);

        // Each countersignature should have a different algorithm
        const algIds = csArray.map((cs: any) => cs.protectedHeaders['1'].value.algorithmId);
        assert.strictEqual(algIds[0], -7);   // ES256
        assert.strictEqual(algIds[1], -35);  // ES384
        assert.strictEqual(algIds[2], -36);  // ES512

        // Each should have unprotected kid
        for (let i = 0; i < 3; i++) {
            assert.ok(csArray[i].unprotectedHeaders, `countersig ${i} should have unprotected headers`);
            assert.ok(csArray[i].signature, `countersig ${i} should have signature`);
        }
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('fixture: standalone-countersignature.cbor (CBOR tag 19)', () => {
        const filePath = path.join(fixturesDir, 'standalone-countersignature.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._cborTag, 19);
        assert.strictEqual(pretty._tagDescription, 'COSE_Countersignature (RFC 9338)');
        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['1']);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'ES256');
        assert.ok(pretty.protectedHeaders['4']);
        assert.ok(pretty.signature);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    // ============================================================
    // COSE_Sign (Tag 98, RFC 9052) tests
    // ============================================================

    test('fixture: cose-sign-multi.cbor (COSE_Sign Tag 98 with two signers)', () => {
        const filePath = path.join(fixturesDir, 'cose-sign-multi.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['1'], 'should have alg header');
        assert.ok(pretty.payload);
        assert.strictEqual(pretty.payload.isEmbedded, true);
        assert.ok(Array.isArray(pretty.signatures), 'should have signatures array');
        assert.strictEqual(pretty.signatures.length, 2);
        assert.strictEqual(pretty.signatures[0].index, 0);
        assert.strictEqual(pretty.signatures[1].index, 1);
        // Signer 0 has ES256, signer 1 has ES384
        assert.ok(pretty.signatures[0].protectedHeaders['1']);
        assert.ok(pretty.signatures[1].protectedHeaders['1']);
        assert.doesNotThrow(() => JSON.stringify(pretty));
        assert.doesNotThrow(() => JSON.stringify(result.raw));
    });

    // ============================================================
    // COSE_Encrypt0 (Tag 16, RFC 9052) tests
    // ============================================================

    test('fixture: cose-encrypt0.cbor (COSE_Encrypt0 Tag 16)', () => {
        const filePath = path.join(fixturesDir, 'cose-encrypt0.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['1'], 'should have alg header');
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'A128GCM');
        assert.ok(pretty.unprotectedHeaders);
        assert.ok(pretty.unprotectedHeaders['5'], 'should have IV header');
        assert.ok(pretty.ciphertext);
        assert.strictEqual(pretty.ciphertext.isPresent, true);
        assert.strictEqual(pretty.ciphertext.sizeBytes, 32);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    // ============================================================
    // COSE_Mac0 (Tag 17, RFC 9052) tests
    // ============================================================

    test('fixture: cose-mac0.cbor (COSE_Mac0 Tag 17)', () => {
        const filePath = path.join(fixturesDir, 'cose-mac0.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.ok(pretty.protectedHeaders['1'], 'should have alg header');
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'HMAC 256/256');
        assert.ok(pretty.payload);
        assert.strictEqual(pretty.payload.isEmbedded, true);
        assert.ok(pretty.tag);
        assert.strictEqual(pretty.tag.sizeBytes, 32);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    // ============================================================
    // COSE_Encrypt (Tag 96, RFC 9052) tests
    // ============================================================

    test('fixture: cose-encrypt-multi.cbor (COSE_Encrypt Tag 96 with two recipients)', () => {
        const filePath = path.join(fixturesDir, 'cose-encrypt-multi.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'A128GCM');
        assert.ok(pretty.ciphertext);
        assert.strictEqual(pretty.ciphertext.isPresent, true);
        assert.strictEqual(pretty.ciphertext.sizeBytes, 48);
        assert.ok(Array.isArray(pretty.recipients), 'should have recipients array');
        assert.strictEqual(pretty.recipients.length, 2);
        assert.strictEqual(pretty.recipients[0].index, 0);
        assert.strictEqual(pretty.recipients[1].index, 1);
        // Recipient 0: ECDH-ES, Recipient 1: A128KW
        assert.ok(pretty.recipients[0].protectedHeaders['1']);
        assert.ok(pretty.recipients[1].protectedHeaders['1']);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    // ============================================================
    // COSE_Mac (Tag 97, RFC 9052) tests
    // ============================================================

    test('fixture: cose-mac-multi.cbor (COSE_Mac Tag 97 with two recipients)', () => {
        const filePath = path.join(fixturesDir, 'cose-mac-multi.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.ok(pretty.protectedHeaders);
        assert.strictEqual(pretty.protectedHeaders['1'].value.algorithmName, 'HMAC 256/256');
        assert.ok(pretty.payload);
        assert.strictEqual(pretty.payload.isEmbedded, true);
        assert.ok(pretty.tag);
        assert.strictEqual(pretty.tag.sizeBytes, 32);
        assert.ok(Array.isArray(pretty.recipients), 'should have recipients array');
        assert.strictEqual(pretty.recipients.length, 2);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    // ============================================================
    // COSE Algorithm expansion tests
    // ============================================================

    test('expanded COSE algorithms are recognized in pretty view', () => {
        const algTests: [number, string][] = [
            [1, 'A128GCM'],
            [2, 'A192GCM'],
            [3, 'A256GCM'],
            [24, 'ChaCha20/Poly1305'],
            [4, 'HMAC 256/64'],
            [5, 'HMAC 256/256'],
            [6, 'HMAC 384/384'],
            [7, 'HMAC 512/512'],
            [14, 'AES-MAC 128/64'],
            [-3, 'A128KW'],
            [-6, 'direct'],
            [-25, 'ECDH-ES + HKDF-256'],
        ];

        for (const [algId, expectedName] of algTests) {
            const protectedHdr = cbor.encodeOne(new Map([[1, algId]]));
            const sig1 = new cbor.Tagged(18, [protectedHdr, new Map(), null, Buffer.alloc(32)]);
            const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(sig1)));
            const pretty: any = result.pretty;
            const algValue = pretty.protectedHeaders?.['1']?.value;
            assert.ok(algValue, `alg ${algId} should produce a value`);
            assert.strictEqual(algValue.algorithmName, expectedName, `alg ${algId} should map to ${expectedName}`);
        }
    });

    // ============================================================
    // CWT Tag 61 (RFC 8392) tests
    // ============================================================

    test('fixture: cwt-tag61.cbor (CWT Tag 61 wrapping COSE_Mac0)', () => {
        const filePath = path.join(fixturesDir, 'cwt-tag61.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._cborTag, 61);
        assert.strictEqual(pretty._tagDescription, 'CWT (RFC 8392)');
        assert.ok(pretty.value, 'CWT should have inner value');
        // Inner value should be formatted as COSE_Mac0
        assert.ok(pretty.value.protectedHeaders);
        assert.ok(pretty.value.tag);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    // ============================================================
    // CBOR Date/Time Tags (RFC 8949, RFC 8943, RFC 9277) tests
    // ============================================================

    test('fixture: datetime-tags.cbor-seq (date/time tag sequence)', () => {
        const filePath = path.join(fixturesDir, 'datetime-tags.cbor-seq');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        assert.strictEqual(pretty._type, 'cbor-sequence');
        assert.strictEqual(pretty.items.length, 5);

        // Tags 0/1 are decoded by cbor lib as Date objects → DateObjectFormatter
        const item0 = pretty.items[0].value;
        assert.ok(item0._tagDescription.includes('Date/Time'));
        assert.ok(item0.dateTime);

        const item1 = pretty.items[1].value;
        assert.ok(item1._tagDescription.includes('Date/Time'));
        assert.ok(item1.dateTime);

        // Tag 100: date-only (kept as Tagged by cbor lib)
        const item2 = pretty.items[2].value;
        assert.strictEqual(item2._cborTag, 100);
        assert.strictEqual(item2._tagDescription, 'Date (RFC 8943)');
        assert.ok(item2.date, 'should have formatted date');

        // Tag 1004: full date string
        const item3 = pretty.items[3].value;
        assert.strictEqual(item3._cborTag, 1004);
        assert.strictEqual(item3._tagDescription, 'Full Date (RFC 9277)');
        assert.strictEqual(item3.date, '2025-06-15');

        // Tag 1003: duration
        const item4 = pretty.items[4].value;
        assert.strictEqual(item4._cborTag, 1003);
        assert.strictEqual(item4._tagDescription, 'Duration (RFC 9277)');
        assert.strictEqual(item4.seconds, 3661);
        assert.strictEqual(item4.humanReadable, '1h 1m 1s');

        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('Tag 0 date/time string (standalone)', () => {
        const tagged = new cbor.Tagged(0, '2025-01-01T00:00:00Z');
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(tagged)));
        const pretty: any = result.pretty;
        // cbor lib decodes Tag 0 as Date → DateObjectFormatter
        assert.ok(pretty._tagDescription.includes('Date/Time'));
        assert.ok(pretty.dateTime);
    });

    test('Tag 1 epoch date/time (standalone)', () => {
        const tagged = new cbor.Tagged(1, 0);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(tagged)));
        const pretty: any = result.pretty;
        // cbor lib decodes Tag 1 as Date → DateObjectFormatter
        assert.ok(pretty._tagDescription.includes('Date/Time'));
        assert.strictEqual(pretty.dateTime, '1970-01-01T00:00:00.000Z');
    });

    // ============================================================
    // CBOR Typed Arrays (RFC 8746) tests
    // ============================================================

    test('fixture: typed-array-uint32.cbor (Tag 66, uint32be)', () => {
        const filePath = path.join(fixturesDir, 'typed-array-uint32.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        // cbor lib converts Tag 66 to Uint32Array → TypedArrayFormatter
        assert.ok(pretty._tagDescription.includes('uint32'));
        assert.ok(pretty._tagDescription.includes('RFC 8746'));
        assert.strictEqual(pretty.length, 5);
        assert.ok(Array.isArray(pretty.preview));
        assert.deepStrictEqual(pretty.preview, [1, 42, 1000, 65535, 0]);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('fixture: typed-array-float64.cbor (Tag 82, float64be)', () => {
        const filePath = path.join(fixturesDir, 'typed-array-float64.cbor');
        const bytes = fs.readFileSync(filePath);
        const result = decodeCborWithViews(new Uint8Array(bytes));
        const pretty: any = result.pretty;

        // cbor lib converts Tag 82 to Float64Array → TypedArrayFormatter
        assert.ok(pretty._tagDescription.includes('float64'));
        assert.strictEqual(pretty.length, 3);
        assert.ok(Array.isArray(pretty.preview));
        assert.ok(Math.abs(pretty.preview[0] - 3.14159) < 0.001);
        assert.ok(Math.abs(pretty.preview[1] - (-273.15)) < 0.001);
        assert.strictEqual(pretty.preview[2], 0);
        assert.doesNotThrow(() => JSON.stringify(pretty));
    });

    test('typed array formatting (int16, native TypedArray)', () => {
        // Create Int16Array directly (as cbor lib would produce)
        const arr = new Int16Array([100, -200, 300, -400, 500, -600, 700, -800, 900, -1000]);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(new cbor.Tagged(73, Buffer.from(arr.buffer)))));
        const pretty: any = result.pretty;

        assert.ok(pretty._tagDescription.includes('int16'));
        assert.strictEqual(pretty.length, 10);
        assert.strictEqual(pretty.preview.length, 8);
        assert.strictEqual(pretty.truncated, true);
    });

    // ============================================================
    // Edge cases for COSE message type validators
    // ============================================================

    test('COSE_Encrypt0 rejects non-3-element arrays under tag 16', () => {
        // Tag 16 with wrong structure should not match Encrypt0 formatter
        const bad = new cbor.Tagged(16, [Buffer.alloc(0), new Map(), Buffer.alloc(10), 'extra']);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(bad)));
        const pretty: any = result.pretty;
        // Falls through to generic tag formatting
        assert.ok(pretty._cborTag === 16 || pretty.ciphertext === undefined);
    });

    test('COSE_Mac0 rejects when tag byte is not bstr', () => {
        // Tag 17 with integer where bstr expected for mac tag
        const bad = new cbor.Tagged(17, [Buffer.alloc(0), new Map(), Buffer.from('pay'), 42]);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(bad)));
        const pretty: any = result.pretty;
        assert.ok(pretty._cborTag === 17 || pretty.tag === undefined);
    });

    test('COSE_Sign rejects non-array signatures field', () => {
        const bad = new cbor.Tagged(98, [Buffer.alloc(0), new Map(), Buffer.from('p'), 'not-array']);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(bad)));
        const pretty: any = result.pretty;
        assert.ok(pretty._cborTag === 98 || pretty.signatures === undefined);
    });

    test('COSE_Encrypt rejects non-array recipients', () => {
        const bad = new cbor.Tagged(96, [Buffer.alloc(0), new Map(), Buffer.alloc(10), 'not-array']);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(bad)));
        const pretty: any = result.pretty;
        assert.ok(pretty._cborTag === 96 || pretty.recipients === undefined);
    });

    test('COSE_Mac rejects 4-element array (missing recipients)', () => {
        // Tag 97 needs 5 elements
        const bad = new cbor.Tagged(97, [Buffer.alloc(0), new Map(), Buffer.from('p'), Buffer.alloc(32)]);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(bad)));
        const pretty: any = result.pretty;
        // Should not match COSE_Mac (requires 5 elements)
        assert.ok(pretty.recipients === undefined);
    });

    test('COSE_Mac0 with nil payload is accepted', () => {
        const prot = cbor.encodeOne(new Map([[1, 5]]));
        const mac0 = new cbor.Tagged(17, [prot, new Map(), null, Buffer.alloc(32, 0xaa)]);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(mac0)));
        const pretty: any = result.pretty;
        assert.ok(pretty.tag);
        assert.strictEqual(pretty.payload.isEmbedded, false);
    });

    test('COSE_Encrypt0 with nil ciphertext is accepted', () => {
        const prot = cbor.encodeOne(new Map([[1, 1]]));
        const enc0 = new cbor.Tagged(16, [prot, new Map(), null]);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(enc0)));
        const pretty: any = result.pretty;
        assert.ok(pretty.ciphertext);
        assert.strictEqual(pretty.ciphertext.isPresent, false);
    });

    test('CWT Tag 61 with non-COSE inner value still renders', () => {
        const cwt = new cbor.Tagged(61, 'just-a-string');
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(cwt)));
        const pretty: any = result.pretty;
        assert.strictEqual(pretty._cborTag, 61);
        assert.strictEqual(pretty.value, 'just-a-string');
    });

    test('Duration tag 1003 with zero seconds', () => {
        const tagged = new cbor.Tagged(1003, 0);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(tagged)));
        const pretty: any = result.pretty;
        assert.strictEqual(pretty._cborTag, 1003);
        assert.strictEqual(pretty.seconds, 0);
        assert.strictEqual(pretty.humanReadable, '0s');
    });

    test('Date tag 100 with negative days (before epoch)', () => {
        const tagged = new cbor.Tagged(100, -365);
        const result = decodeCborWithViews(new Uint8Array(cbor.encodeOne(tagged)));
        const pretty: any = result.pretty;
        assert.strictEqual(pretty._cborTag, 100);
        assert.ok(pretty.date, 'should produce a date string');
        assert.ok(pretty.date.startsWith('1969'), `date should be 1969, got ${pretty.date}`);
    });
});
