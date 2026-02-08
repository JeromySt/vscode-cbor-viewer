/**
 * @fileoverview Cose Algorithms (pretty core).
 *
 * - Shared primitives used across pretty formatting and extenders.
 * - Focus on small, well-tested helpers and types.
 */
export function getCoseAlgorithmName(algorithm: number): string {
    // COSE Algorithms registry (RFC 9053, RFC 9054, and related)
    switch (algorithm) {
        // Signing: ECDSA w/ SHA-2
        case -7:
            return 'ES256';
        case -35:
            return 'ES384';
        case -36:
            return 'ES512';

        // Signing: RSASSA-PSS w/ SHA-2
        case -37:
            return 'PS256';
        case -38:
            return 'PS384';
        case -39:
            return 'PS512';

        // Signing: RSASSA-PKCS1-v1_5 w/ SHA-2
        case -257:
            return 'RS256';
        case -258:
            return 'RS384';
        case -259:
            return 'RS512';

        // Signing: EdDSA
        case -8:
            return 'EdDSA';

        // Encryption: AES-GCM
        case 1:
            return 'A128GCM';
        case 2:
            return 'A192GCM';
        case 3:
            return 'A256GCM';

        // Encryption: ChaCha20/Poly1305
        case 24:
            return 'ChaCha20/Poly1305';

        // Encryption: AES-CCM
        case 10:
            return 'AES-CCM-16-64-128';
        case 11:
            return 'AES-CCM-16-64-256';
        case 12:
            return 'AES-CCM-64-64-128';
        case 13:
            return 'AES-CCM-64-64-256';
        case 30:
            return 'AES-CCM-16-128-128';
        case 31:
            return 'AES-CCM-16-128-256';
        case 32:
            return 'AES-CCM-64-128-128';
        case 33:
            return 'AES-CCM-64-128-256';

        // MAC: HMAC
        case 4:
            return 'HMAC 256/64';
        case 5:
            return 'HMAC 256/256';
        case 6:
            return 'HMAC 384/384';
        case 7:
            return 'HMAC 512/512';

        // MAC: AES-MAC
        case 14:
            return 'AES-MAC 128/64';
        case 15:
            return 'AES-MAC 256/64';
        case 25:
            return 'AES-MAC 128/128';
        case 26:
            return 'AES-MAC 256/128';

        // Key Agreement: Direct
        case -6:
            return 'direct';

        // Key Agreement: ECDH-ES + HKDF
        case -25:
            return 'ECDH-ES + HKDF-256';
        case -26:
            return 'ECDH-ES + HKDF-512';

        // Key Agreement: ECDH-SS + HKDF
        case -27:
            return 'ECDH-SS + HKDF-256';
        case -28:
            return 'ECDH-SS + HKDF-512';

        // Key Wrap: ECDH-ES + AES-KW
        case -29:
            return 'ECDH-ES + A128KW';
        case -30:
            return 'ECDH-ES + A192KW';
        case -31:
            return 'ECDH-ES + A256KW';

        // Key Wrap: ECDH-SS + AES-KW
        case -32:
            return 'ECDH-SS + A128KW';
        case -33:
            return 'ECDH-SS + A192KW';
        case -34:
            return 'ECDH-SS + A256KW';

        // Key Wrap: AES Key Wrap
        case -3:
            return 'A128KW';
        case -4:
            return 'A192KW';
        case -5:
            return 'A256KW';

        default:
            return `Unknown (${algorithm})`;
    }
}
