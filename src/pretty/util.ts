/**
 * @fileoverview Util (pretty pipeline).
 *
 * - Core pretty-formatting pipeline and infrastructure.
 * - Wires registries/extenders into a bounded, JSON-safe output shape.
 */
/**
 * Utility helpers for dealing with "decoded CBOR" values.
 *
 * CBOR decoding libraries and formatters can produce different JS representations:
 * - byte strings may be `Buffer` or `Uint8Array`
 * - maps may be `Map` or plain objects (often when keys are strings)
 * - map keys can be non-strings (numbers, byte strings, nested objects)
 *
 * These helpers normalize those shapes so the rest of the pipeline can stay consistent.
 */

/** Convert a byte-like value to `Buffer`, or return null if it isn't bytes. */
export function toBuffer(value: unknown): Buffer | null {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value);
    }
    return null;
}

/**
 * Treat a decoded value as a map.
 *
 * We accept:
 * - `Map` directly
 * - plain objects (excluding arrays/dates/byte-like objects) as a convenience for decoders
 *   that collapse string-keyed maps into objects.
 */
export function asCborMap(value: unknown): Map<unknown, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    if (value instanceof Map) {
        return value;
    }

    // Some CBOR decoders may return plain objects for maps with string keys.
    if (!Array.isArray(value) && !(value instanceof Date) && !(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
        const obj = value as Record<string, unknown>;
        const map = new Map<unknown, unknown>();
        for (const [k, v] of Object.entries(obj)) {
            map.set(k, v);
        }
        return map;
    }

    return null;
}

function bufferToHex(buffer: Buffer): string {
    return buffer.toString('hex');
}

function convertBuffersToHex(obj: unknown): string | Record<string, unknown> | unknown[] | unknown {
    if (Buffer.isBuffer(obj)) {
        return bufferToHex(obj);
    } else if (obj instanceof Map) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of obj.entries()) {
            result[mapKeyToString(key)] = convertBuffersToHex(value);
        }
        return result;
    } else if (Array.isArray(obj)) {
        return obj.map(item => convertBuffersToHex(item));
    } else if (obj !== null && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const key in obj as any) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = convertBuffersToHex((obj as Record<string, unknown>)[key]);
            }
        }
        return result;
    }
    return obj;
}

export function mapKeyToString(key: unknown): string {
    if (typeof key === 'string') {
        return key;
    }
    if (typeof key === 'number' || typeof key === 'bigint' || typeof key === 'boolean') {
        return String(key);
    }
    const b = toBuffer(key);
    if (b) {
        return b.toString('hex');
    }
    try {
        // JSON encoding is the least-bad option for complex keys.
        // We also convert embedded Buffers to hex so the output remains JSON-safe.
        return JSON.stringify(convertBuffersToHex(key));
    } catch {
        return String(key);
    }
}

/**
 * Heuristic: checks whether bytes are likely human-readable UTF-8 text.
 *
 * This is intentionally conservative: it rejects NUL bytes, a high ratio of
 * replacement characters (U+FFFD), and control characters.
 */
export function isLikelyUtf8Text(data: Buffer): boolean {
    if (data.length === 0) {
        return false;
    }

    const sample = data.subarray(0, Math.min(4096, data.length));
    // NUL is an extremely strong signal for binary.
    if (sample.includes(0)) {
        return false;
    }

    const s = sample.toString('utf8');
    if (s.length === 0) {
        return false;
    }

    let replacementCount = 0;
    let controlCount = 0;
    let printableCount = 0;
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code === 0xfffd) {
            replacementCount++;
            continue;
        }

        // Allow common whitespace.
        if (code === 9 || code === 10 || code === 13) {
            printableCount++;
            continue;
        }

        // Reject C0/C1 controls.
        if (code < 32 || (code >= 0x7f && code <= 0x9f)) {
            controlCount++;
            continue;
        }

        printableCount++;
    }

    const len = s.length;
    const replacementRatio = replacementCount / len;
    const controlRatio = controlCount / len;
    const printableRatio = printableCount / len;

    if (replacementRatio > 0.02) {
        return false;
    }
    if (controlRatio > 0.05) {
        return false;
    }
    return printableRatio > 0.85;
}
