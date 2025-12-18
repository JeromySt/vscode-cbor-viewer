export function getHashAlgorithmName(algorithm: number): string {
    switch (algorithm) {
        case -16:
            return 'SHA-256';
        case -43:
            return 'SHA-384';
        case -44:
            return 'SHA-512';
        default:
            return `Unknown (${algorithm})`;
    }
}
