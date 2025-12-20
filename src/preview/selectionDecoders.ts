/**
 * @fileoverview Selection Decoders (preview pipeline).
 *
 * - Preview pipeline infrastructure (webview actions, derived artifacts, selection decoding).
 * - Designed to keep the webview unprivileged and the extension host in control.
 */
function stripQuotes(input: string): string {
    const t = (input ?? '').trim();
    if (t.length >= 2) {
        const first = t[0];
        const last = t[t.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return t.slice(1, -1);
        }
    }
    return t;
}

function tryParseJson(input: string): unknown {
    const t = (input ?? '').trim();
    if (!t) {
        return undefined;
    }
    if (t[0] !== '[' && t[0] !== '{') {
        return undefined;
    }
    try {
        return JSON.parse(t);
    } catch {
        return undefined;
    }
}

function isByteArray(value: unknown): value is number[] {
    if (!Array.isArray(value) || value.length === 0) {
        return false;
    }
    for (let i = 0; i < value.length; i++) {
        const n = (value as any)[i];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) {
            return false;
        }
    }
    return true;
}

function tryParseHexToBytes(input: string): Uint8Array | undefined {
    const cleaned = stripQuotes(input).trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (!cleaned) {
        return new Uint8Array();
    }
    if (cleaned.length % 2 !== 0) {
        return undefined;
    }
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
        return undefined;
    }
    return new Uint8Array(Buffer.from(cleaned, 'hex'));
}

function tryDecodeBase64ToBytes(input: string): Uint8Array | undefined {
    let s = stripQuotes(input).trim();
    if (!s) {
        return new Uint8Array();
    }

    // Allow whitespace/newlines in selections.
    s = s.replace(/\s+/g, '');

    // Support base64url too.
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
        return undefined;
    }
    const mod = s.length % 4;
    if (mod === 1) {
        return undefined;
    }
    if (mod === 2) {
        s += '==';
    }
    if (mod === 3) {
        s += '=';
    }

    try {
        const buf = Buffer.from(s, 'base64');
        if (!buf || buf.length === 0) {
            return undefined;
        }
        return new Uint8Array(buf);
    } catch {
        return undefined;
    }
}

export function tryDecodeSelectionToBytes(selectionText: string): Uint8Array | undefined {
    const t = (selectionText ?? '').trim();
    if (!t) {
        return undefined;
    }

    // JSON byte array: [1,2,3]
    const parsed = tryParseJson(t);
    if (isByteArray(parsed)) {
        return new Uint8Array(parsed);
    }

    // Hex
    const hex = tryParseHexToBytes(t);
    if (hex) {
        return hex;
    }

    // Base64/base64url
    return tryDecodeBase64ToBytes(t);
}
