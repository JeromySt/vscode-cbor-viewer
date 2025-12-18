export function toBuffer(value: unknown): Buffer | null {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value);
    }
    return null;
}

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
        return JSON.stringify(convertBuffersToHex(key));
    } catch {
        return String(key);
    }
}
