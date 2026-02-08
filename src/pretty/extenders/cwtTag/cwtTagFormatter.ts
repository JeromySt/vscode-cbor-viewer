/**
 * @fileoverview CWT Tag Formatter (pretty extender).
 *
 * Handles CBOR Tag 61: CWT (CBOR Web Token, RFC 8392).
 * The inner value is typically a COSE message (Sign1, Mac0, Encrypt0, etc.)
 * which will be further formatted by the appropriate COSE extender.
 */
import * as cbor from 'cbor';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';

const CWT_TAG = 61;

export const CwtTagFormatter: PrettyFormatter = {
    id: 'cbor-tag-61-cwt',
    order: 89,
    canFormat(value: unknown): boolean {
        return value instanceof (cbor as any).Tagged && (value as any).tag === CWT_TAG;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = (value as any).value;
        return {
            _cborTag: CWT_TAG,
            _tagDescription: 'CWT (RFC 8392)',
            value: ctx.format(inner, ctx.depth + 1)
        };
    }
};
