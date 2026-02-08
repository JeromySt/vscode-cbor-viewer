/**
 * @fileoverview COSE Countersignature formatter (pretty extender).
 *
 * Handles COSE countersignature header parameters defined in RFC 9338:
 * - Label 7:  counter signature (v1, RFC 8152)
 * - Label 11: CounterSignatureV2
 * - Label 12: CounterSignature0V2
 *
 * Also handles CBOR tag 19 (COSE_Countersignature) at the top level.
 *
 * COSE_Countersignature has the same structure as COSE_Signature:
 *   [protected: bstr, unprotected: map, signature: bstr]
 */
import * as cbor from 'cbor';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { ValueType } from '../../core/valueTypes';
import { toBuffer, asCborMap } from '../../util';
import { toInt32 } from '../../core/numeric';
import { getCoseAlgorithmName } from '../../core/coseAlgorithms';

// --- Header-level formatter (delegated from coseSign1Formatter) ---

type CoseCountersignatureInput = {
    _type: 'cose-countersignature';
    protectedHeaders: Map<unknown, unknown>;
    unprotectedHeaders?: Map<unknown, unknown> | null;
};

type HeaderContribution = { valueType?: ValueType; value?: unknown };

type CountersignatureExtResult = {
    protectedHeaders?: Record<string, HeaderContribution>;
    unprotectedHeaders?: Record<string, HeaderContribution>;
};

/** Labels that carry countersignature values. */
const COUNTERSIG_LABELS = [7, 11, 12] as const;

export const CoseCountersignatureFormatter: PrettyFormatter = {
    id: 'cose-countersignature',
    order: 145,
    canFormat(value: unknown): boolean {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const v = value as Partial<CoseCountersignatureInput>;
        return v._type === 'cose-countersignature' && v.protectedHeaders instanceof Map;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const v = value as CoseCountersignatureInput;
        const result: CountersignatureExtResult = {};

        formatCountersigHeaders(result, ctx, v.protectedHeaders, 'protected');
        if (v.unprotectedHeaders) {
            formatCountersigHeaders(result, ctx, v.unprotectedHeaders, 'unprotected');
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
};

function formatCountersigHeaders(
    result: CountersignatureExtResult,
    ctx: PrettyFormatterContext,
    headers: Map<unknown, unknown>,
    location: 'protected' | 'unprotected'
): void {
    for (const label of COUNTERSIG_LABELS) {
        if (!headers.has(label)) {
            continue;
        }
        const value = headers.get(label);
        const contribution = formatCountersigValue(ctx, label, value);
        if (!contribution) {
            continue;
        }

        const target = location === 'protected'
            ? (result.protectedHeaders ??= {})
            : (result.unprotectedHeaders ??= {});
        target[String(label)] = contribution;
    }
}

function formatCountersigValue(
    ctx: PrettyFormatterContext,
    label: number,
    value: unknown
): HeaderContribution | undefined {
    // Label 12 (CounterSignature0V2): abbreviated — just a bstr signature value.
    if (label === 12) {
        const buf = toBuffer(value);
        if (buf) {
            return {
                valueType: 'bytes',
                value: ctx.bytesPreview(buf)
            };
        }
        return undefined;
    }

    // Labels 7 and 11: full countersignature — a COSE_Countersignature or array of them.
    // A single countersignature is an array: [protected, unprotected, signature].
    // Multiple countersignatures: [[protected, unprotected, signature], ...].
    if (Array.isArray(value)) {
        // Distinguish single vs. array-of by checking if the first element is an array.
        if (value.length > 0 && Array.isArray(value[0])) {
            // Array of countersignatures: validate each is a 3-tuple.
            const allValid = value.every(
                (cs: unknown) => Array.isArray(cs) && cs.length === 3
            );
            if (!allValid) {
                return undefined;
            }
            const inspected = value.map((cs, i) => ({
                index: i,
                ...inspectCountersignature(ctx, cs)
            }));
            return { valueType: 'array', value: inspected };
        }
        // Single countersignature: must be a 3-tuple.
        if (value.length !== 3) {
            return undefined;
        }
        return { valueType: 'map', value: inspectCountersignature(ctx, value) };
    }

    return undefined;
}

// --- Tag-19 top-level formatter ---

/** CBOR tag 19 = COSE_Countersignature (standalone). */
const COSE_COUNTERSIGNATURE_TAG = 19;

export const CoseCountersignatureTagFormatter: PrettyFormatter = {
    id: 'cose-countersignature-tag',
    order: 105,
    canFormat(value: unknown): boolean {
        if (value instanceof (cbor as any).Tagged) {
            const tag = (value as any).tag;
            return tag === COSE_COUNTERSIGNATURE_TAG;
        }
        return false;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const inner = (value as any).value;
        if (!Array.isArray(inner) || inner.length < 3) {
            return undefined;
        }
        return {
            _cborTag: COSE_COUNTERSIGNATURE_TAG,
            _tagDescription: 'COSE_Countersignature (RFC 9338)',
            ...inspectCountersignature(ctx, inner)
        };
    }
};

// --- Shared countersignature inspection ---

/**
 * Inspect a single COSE_Countersignature / COSE_Signature structure.
 *
 * Structure: [protected: bstr, unprotected: map, signature: bstr]
 */
function inspectCountersignature(
    ctx: PrettyFormatterContext,
    data: unknown[]
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // protected headers
    const protectedBytes = toBuffer(data[0]);
    if (protectedBytes && protectedBytes.length > 0) {
        try {
            const decoded = cbor.decodeFirstSync(protectedBytes);
            const map = asCborMap(decoded);
            if (map) {
                const headers: Record<string, unknown> = {};
                for (const [k, v] of map.entries()) {
                    const labelId = toInt32(k);
                    const key = labelId !== null ? String(labelId) : String(k);
                    if (labelId === 1) {
                        const algId = toInt32(v);
                        headers[key] = {
                            label: ctx.labels.getCoseHeaderName(1),
                            algorithmId: algId,
                            algorithmName: algId !== null ? getCoseAlgorithmName(algId) : String(v)
                        };
                    } else {
                        const label = labelId !== null ? ctx.labels.getCoseHeaderName(labelId) : undefined;
                        headers[key] = label && label !== 'Header (custom)'
                            ? { label, value: ctx.formatAtDepthLimit(v) }
                            : { value: ctx.formatAtDepthLimit(v) };
                    }
                }
                result.protectedHeaders = headers;
            }
        } catch {
            result.protectedHeaders = ctx.bytesPreview(protectedBytes);
        }
    }

    // unprotected headers
    const unprotectedMap = asCborMap(data[1]) ?? (data[1] instanceof Map ? data[1] : null);
    if (unprotectedMap && unprotectedMap.size > 0) {
        const headers: Record<string, unknown> = {};
        for (const [k, v] of unprotectedMap.entries()) {
            const labelId = toInt32(k);
            const key = labelId !== null ? String(labelId) : String(k);
            const label = labelId !== null ? ctx.labels.getCoseHeaderName(labelId) : undefined;
            headers[key] = label && label !== 'Header (custom)'
                ? { label, value: ctx.formatAtDepthLimit(v) }
                : { value: ctx.formatAtDepthLimit(v) };
        }
        result.unprotectedHeaders = headers;
    }

    // signature
    const sigBytes = toBuffer(data[2]);
    if (sigBytes) {
        result.signature = ctx.bytesPreview(sigBytes);
    }

    return result;
}
