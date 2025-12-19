import * as assert from 'assert';

suite('Unit: algorithm name helpers', () => {
    test('getCoseAlgorithmName covers known + unknown ids', async () => {
        const { getCoseAlgorithmName } = require('../../pretty/core/coseAlgorithms');
        assert.strictEqual(getCoseAlgorithmName(-7), 'ES256');
        assert.strictEqual(getCoseAlgorithmName(-35), 'ES384');
        assert.strictEqual(getCoseAlgorithmName(-36), 'ES512');
        assert.strictEqual(getCoseAlgorithmName(-37), 'PS256');
        assert.strictEqual(getCoseAlgorithmName(-38), 'PS384');
        assert.strictEqual(getCoseAlgorithmName(-39), 'PS512');
        assert.strictEqual(getCoseAlgorithmName(-257), 'RS256');
        assert.strictEqual(getCoseAlgorithmName(-258), 'RS384');
        assert.strictEqual(getCoseAlgorithmName(-259), 'RS512');
        assert.strictEqual(getCoseAlgorithmName(-8), 'EdDSA');
        assert.ok(getCoseAlgorithmName(123).includes('Unknown'));
    });

    test('getHashAlgorithmName covers known + unknown ids', async () => {
        const { getHashAlgorithmName } = require('../../pretty/core/hashAlgorithms');
        assert.strictEqual(getHashAlgorithmName(-16), 'SHA-256');
        assert.strictEqual(getHashAlgorithmName(-43), 'SHA-384');
        assert.strictEqual(getHashAlgorithmName(-44), 'SHA-512');
        assert.ok(getHashAlgorithmName(999).includes('Unknown'));
    });
});
