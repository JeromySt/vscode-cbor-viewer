export function getCoseAlgorithmName(algorithm: number): string {
    // COSE Algorithms registry (RFC 9053 and related)
    // We keep this intentionally small and practical; unknown ids still render.
    switch (algorithm) {
        // ECDSA w/ SHA-2
        case -7:
            return 'ES256';
        case -35:
            return 'ES384';
        case -36:
            return 'ES512';

        // RSASSA-PSS w/ SHA-2
        case -37:
            return 'PS256';
        case -38:
            return 'PS384';
        case -39:
            return 'PS512';

        // RSASSA-PKCS1-v1_5 w/ SHA-2
        case -257:
            return 'RS256';
        case -258:
            return 'RS384';
        case -259:
            return 'RS512';

        // EdDSA
        case -8:
            return 'EdDSA';

        default:
            return `Unknown (${algorithm})`;
    }
}
