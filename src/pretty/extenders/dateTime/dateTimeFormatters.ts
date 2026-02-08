/**
 * @fileoverview CBOR Date/Time Tag Formatters (pretty extender).
 *
 * Handles CBOR date/time tags:
 * - Tag 0: Standard date/time string (RFC 8949 §3.4.1) — decoded by cbor lib as Date
 * - Tag 1: Epoch-based date/time (RFC 8949 §3.4.2) — decoded by cbor lib as Date
 * - Tag 100: Date without time (RFC 8943)
 * - Tag 1004: Full date string (RFC 9277)
 * - Tag 1003: Duration (RFC 9277)
 *
 * Note: The cbor library auto-converts Tags 0 and 1 into JS Date objects,
 * so we match on `instanceof Date` rather than `instanceof Tagged`.
 */
import * as cbor from 'cbor';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';

function isTag(value: unknown, tag: number): boolean {
    return value instanceof (cbor as any).Tagged && (value as any).tag === tag;
}

function getTagValue(value: unknown): unknown {
    return (value as any).value;
}

/**
 * Tags 0/1: The cbor library decodes these as JS Date objects.
 * We format them with the original ISO string and epoch value.
 */
export const DateObjectFormatter: PrettyFormatter = {
    id: 'cbor-date-object',
    order: 90,
    canFormat(value: unknown): boolean {
        return value instanceof Date;
    },
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const d = value as Date;
        const epoch = d.getTime() / 1000;
        return {
            _cborTag: Number.isInteger(epoch) && epoch >= 0 ? 1 : 0,
            _tagDescription: 'Date/Time (RFC 8949)',
            dateTime: d.toISOString(),
            epochSeconds: epoch
        };
    }
};

/**
 * Tag 100: Date without time of day (RFC 8943).
 * Value is an integer: number of days since 1970-01-01 (can be negative).
 */
export const DateOnlyFormatter: PrettyFormatter = {
    id: 'cbor-tag-100-date',
    order: 90,
    canFormat(value: unknown): boolean {
        return isTag(value, 100);
    },
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const inner = getTagValue(value);
        const days = typeof inner === 'number' ? inner
            : typeof inner === 'bigint' ? Number(inner)
            : null;

        const result: Record<string, unknown> = {
            _cborTag: 100,
            _tagDescription: 'Date (RFC 8943)',
            daysSinceEpoch: inner
        };

        if (days !== null && isFinite(days)) {
            try {
                const ms = days * 86400000;
                const d = new Date(ms);
                result.date = d.toISOString().slice(0, 10);
            } catch {
                // Invalid date
            }
        }

        return result;
    }
};

/**
 * Tag 1004: Full-date string (RFC 9277).
 * Value is a text string in RFC 3339 full-date format (YYYY-MM-DD).
 */
export const FullDateStringFormatter: PrettyFormatter = {
    id: 'cbor-tag-1004-full-date',
    order: 90,
    canFormat(value: unknown): boolean {
        return isTag(value, 1004);
    },
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const inner = getTagValue(value);
        return {
            _cborTag: 1004,
            _tagDescription: 'Full Date (RFC 9277)',
            date: typeof inner === 'string' ? inner : String(inner)
        };
    }
};

/**
 * Tag 1003: Duration (RFC 9277).
 * Value is a number (seconds) or a text string (ISO 8601 duration).
 */
export const DurationFormatter: PrettyFormatter = {
    id: 'cbor-tag-1003-duration',
    order: 90,
    canFormat(value: unknown): boolean {
        return isTag(value, 1003);
    },
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const inner = getTagValue(value);
        const result: Record<string, unknown> = {
            _cborTag: 1003,
            _tagDescription: 'Duration (RFC 9277)'
        };

        if (typeof inner === 'number') {
            result.seconds = inner;
            result.humanReadable = formatDuration(inner);
        } else if (typeof inner === 'string') {
            result.duration = inner;
        } else {
            result.value = inner;
        }

        return result;
    }
};

function formatDuration(totalSeconds: number): string {
    const abs = Math.abs(totalSeconds);
    const sign = totalSeconds < 0 ? '-' : '';
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;

    const parts: string[] = [];
    if (h > 0) { parts.push(`${h}h`); }
    if (m > 0) { parts.push(`${m}m`); }
    if (s > 0 || parts.length === 0) { parts.push(`${s}s`); }
    return sign + parts.join(' ');
}
