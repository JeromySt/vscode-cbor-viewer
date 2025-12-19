import * as assert from 'assert';

suite('Unit: CoseHeadersExplicitFormatter', () => {
    test('canFormat + format merges header contributions', async () => {
        const { CoseHeadersExplicitFormatter } = require('../../pretty/extenders/coseSign1/coseHeadersExplicitFormatter');

        const headersMap = new Map<any, any>([[1, -7]]);
        const input = { _type: 'cose-headers', headers: headersMap };

        assert.strictEqual(CoseHeadersExplicitFormatter.canFormat(input), true);
        assert.strictEqual(CoseHeadersExplicitFormatter.canFormat({}), false);

        const ctx: any = {
            depth: 0,
            labels: {
                getCoseHeaderName: (id: number) => (id === 1 ? 'alg' : undefined)
            },
            format: (value: any) => {
                if (value && value._type === 'cose-alg') {
                    return {
                        protectedHeaders: {
                            '1': {
                                label: 'alg',
                                value: {
                                    headerName: 'alg',
                                    algorithmId: -7,
                                    algorithmName: 'ES256'
                                }
                            }
                        }
                    };
                }
                if (value && value._type === 'cose-hash-message') {
                    return null;
                }
                if (value && value._type === 'cose-certificates') {
                    return { other: true };
                }
                return value;
            }
        };

        const out = CoseHeadersExplicitFormatter.format(input, ctx);
        assert.ok(out);
        assert.ok((out as any)['1']);
        assert.strictEqual((out as any)['1'].label, 'alg');
        assert.ok((out as any)['1'].value);
        assert.strictEqual((out as any)['1'].value.algorithmName, 'ES256');
    });
});
