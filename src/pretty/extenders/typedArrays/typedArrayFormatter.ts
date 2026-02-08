/**
 * @fileoverview CBOR Typed Array Formatter (pretty extender).
 *
 * Handles CBOR Tags 64-87 (RFC 8746): typed arrays of numeric values.
 *
 * Note: The cbor library automatically converts these tags into native JS
 * TypedArray objects (Uint16Array, Float32Array, etc.), so we match on
 * `instanceof` rather than checking the CBOR tag number.
 * Uint8Array is excluded since it's the standard CBOR byte string type.
 */
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';

const MAX_PREVIEW_ELEMENTS = 8;

// Map JS TypedArray constructor names to CBOR tag descriptions.
const TYPED_ARRAY_INFO: Record<string, string> = {
    'Int8Array': 'int8',
    'Int16Array': 'int16',
    'Int32Array': 'int32',
    'Uint16Array': 'uint16',
    'Uint32Array': 'uint32',
    'Float32Array': 'float32',
    'Float64Array': 'float64',
    'BigInt64Array': 'int64',
    'BigUint64Array': 'uint64',
};

function isNonByteTypedArray(value: unknown): value is ArrayBufferView {
    if (!value || typeof value !== 'object') {
        return false;
    }
    // Uint8Array is standard CBOR bstr — not a "typed array tag" result
    if (value instanceof Uint8Array && !(value instanceof Uint16Array)) {
        return false;
    }
    const name = value.constructor?.name;
    return name !== undefined && name in TYPED_ARRAY_INFO;
}

export const TypedArrayFormatter: PrettyFormatter = {
    id: 'cbor-typed-array',
    order: 91,
    canFormat(value: unknown): boolean {
        return isNonByteTypedArray(value);
    },
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const arr = value as any;
        const typeName = TYPED_ARRAY_INFO[arr.constructor.name] ?? arr.constructor.name;
        const len = arr.length as number;

        const preview: (number | string)[] = [];
        const previewCount = Math.min(len, MAX_PREVIEW_ELEMENTS);
        for (let i = 0; i < previewCount; i++) {
            const v = arr[i];
            preview.push(typeof v === 'bigint' ? v.toString() : v);
        }

        const result: Record<string, unknown> = {
            _tagDescription: `TypedArray<${typeName}> (RFC 8746)`,
            elementType: typeName,
            length: len,
            sizeBytes: arr.byteLength
        };

        if (preview.length > 0) {
            result.preview = preview;
            if (len > MAX_PREVIEW_ELEMENTS) {
                result.truncated = true;
            }
        }

        return result;
    }
};
