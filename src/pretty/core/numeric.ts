/**
 * @fileoverview Numeric (pretty core).
 *
 * - Shared primitives used across pretty formatting and extenders.
 * - Focus on small, well-tested helpers and types.
 */
export function toInt32(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
        return value;
    }
    if (typeof value === 'string') {
        const s = value.trim();
        if (/^-?\d+$/.test(s)) {
            const n = Number(s);
            if (Number.isInteger(n) && n >= -2147483648 && n <= 2147483647) {
                return n;
            }
        }
    }
    if (typeof value === 'bigint') {
        if (value >= -2147483648n && value <= 2147483647n) {
            return Number(value);
        }
    }
    return null;
}
