export function tryParseHexToBytes(hex: string): Uint8Array | undefined {
    const cleaned = hex.trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (!cleaned) {
        return new Uint8Array();
    }
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
        return undefined;
    }
    if (cleaned.length % 2 !== 0) {
        return undefined;
    }

    const buf = Buffer.from(cleaned, 'hex');
    return new Uint8Array(buf);
}

export function tryDecodeBase64ToBytes(input: string): Uint8Array | undefined {
    const trimmed = input.trim();
    if (!trimmed) {
        return new Uint8Array();
    }

    // Support base64url too.
    let s = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
        return undefined;
    }
    const mod = s.length % 4;
    if (mod === 1) {
        return undefined;
    }
    if (mod !== 0) {
        s = s + '='.repeat(4 - mod);
    }

    const buf = Buffer.from(s, 'base64');
    if (buf.length === 0 && s.length > 0) {
        return undefined;
    }
    return new Uint8Array(buf);
}

export function tryDecodeByteArray(arr: unknown[]): Uint8Array | undefined {
    const out = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) {
            return undefined;
        }
        out[i] = n;
    }
    return out;
}
