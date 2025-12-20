/**
 * @fileoverview Cose Hash Message Formatter (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import { getHashAlgorithmName } from '../../core/hashAlgorithms';
import { toInt32 } from '../../core/numeric';
import type { ValueType } from '../../core/valueTypes';

type CoseHashMessageInput = {
    _type: 'cose-hash-message';
    protectedHeaders: Map<unknown, unknown>;
    unprotectedHeaders?: Map<unknown, unknown> | null;
};

type HeaderContribution = { valueType?: ValueType; value?: unknown };

type CoseHashMessageResult = {
    protectedHeaders?: Record<string, HeaderContribution>;
    unprotectedHeaders?: Record<string, HeaderContribution>;
};

export const CoseHashMessageFormatter: PrettyFormatter = {
    id: 'cose-hash-message',
    order: 140,
    canFormat(value: unknown): boolean {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const v = value as Partial<CoseHashMessageInput>;
        return v._type === 'cose-hash-message' && v.protectedHeaders instanceof Map;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const v = value as CoseHashMessageInput;
        const result: CoseHashMessageResult = {};

        addPayloadHashAlgOverride(result, ctx, v.protectedHeaders, 'protected');
        if (v.unprotectedHeaders) {
            addPayloadHashAlgOverride(result, ctx, v.unprotectedHeaders, 'unprotected');
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
};

function addPayloadHashAlgOverride(
    result: CoseHashMessageResult,
    ctx: PrettyFormatterContext,
    headers: Map<unknown, unknown>,
    location: 'protected' | 'unprotected'
): void {
    // payload-hash-alg (258)
    const payloadHashAlg = headers.get(258);
    const payloadHashAlgId = toInt32(payloadHashAlg);
    if (payloadHashAlgId === null) {
        return;
    }

    const derived: {
        headerName: string;
        algorithmId: number;
        algorithmName: string;
    } = {
        headerName: ctx.labels.getCoseHeaderName(258),
        algorithmId: payloadHashAlgId,
        algorithmName: getHashAlgorithmName(payloadHashAlgId)
    };

    const patch: HeaderContribution = { valueType: 'map', value: derived };

    if (location === 'protected') {
        if (!result.protectedHeaders) {
            result.protectedHeaders = {};
        }
        result.protectedHeaders['258'] = patch;
    } else {
        if (!result.unprotectedHeaders) {
            result.unprotectedHeaders = {};
        }
        result.unprotectedHeaders['258'] = patch;
    }
}
