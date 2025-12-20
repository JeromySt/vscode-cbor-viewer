/**
 * @fileoverview Cose Algorithm Formatter (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import { getCoseAlgorithmName } from '../../core/coseAlgorithms';
import { toInt32 } from '../../core/numeric';
import type { ValueType } from '../../core/valueTypes';

type CoseAlgInput = {
    _type: 'cose-alg';
    protectedHeaders: Map<unknown, unknown>;
    unprotectedHeaders?: Map<unknown, unknown> | null;
};

type HeaderContribution = { valueType?: ValueType; value?: unknown };

type CoseAlgResult = {
    protectedHeaders?: Record<string, HeaderContribution>;
    unprotectedHeaders?: Record<string, HeaderContribution>;
};

export const CoseAlgorithmFormatter: PrettyFormatter = {
    id: 'cose-alg',
    order: 135,
    canFormat(value: unknown): boolean {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const v = value as Partial<CoseAlgInput>;
        return v._type === 'cose-alg' && v.protectedHeaders instanceof Map;
    },
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const v = value as CoseAlgInput;
        const result: CoseAlgResult = {};

        addAlgOverride(result, ctx, v.protectedHeaders, 'protected');
        if (v.unprotectedHeaders) {
            addAlgOverride(result, ctx, v.unprotectedHeaders, 'unprotected');
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
};

function addAlgOverride(
    result: CoseAlgResult,
    ctx: PrettyFormatterContext,
    headers: Map<unknown, unknown>,
    location: 'protected' | 'unprotected'
): void {
    // alg (1)
    const alg = headers.get(1);
    const algId = toInt32(alg);

    // If alg isn't an int-ish value (e.g. float), keep the raw header entry.
    if (algId === null) {
        return;
    }

    const derived: {
        headerName: string;
        algorithmId: number;
        algorithmName: string;
    } = {
        headerName: ctx.labels.getCoseHeaderName(1),
        algorithmId: algId,
        algorithmName: getCoseAlgorithmName(algId)
    };

    const patch: HeaderContribution = { valueType: 'map', value: derived };

    if (location === 'protected') {
        if (!result.protectedHeaders) {
            result.protectedHeaders = {};
        }
        result.protectedHeaders['1'] = patch;
    } else {
        if (!result.unprotectedHeaders) {
            result.unprotectedHeaders = {};
        }
        result.unprotectedHeaders['1'] = patch;
    }
}
