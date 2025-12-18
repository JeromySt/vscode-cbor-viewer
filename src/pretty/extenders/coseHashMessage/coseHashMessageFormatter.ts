import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import { getHashAlgorithmName } from '../../core/hashAlgorithms';
import { toInt32 } from '../../core/numeric';

type AlgorithmInfo = { id: number; name: string };

type CoseHashMessageInput = {
    _type: 'cose-hash-message';
    protectedHeaders: Map<unknown, unknown>;
};

type CoseHashMessageResult = {
    protectedHeaders: {
        payloadHashAlgorithm?: AlgorithmInfo;
        preimageContentType?: string;
        payloadLocation?: string;
    };
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
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const v = value as CoseHashMessageInput;
        const headers = v.protectedHeaders;

        const out: CoseHashMessageResult['protectedHeaders'] = {};

        // payload-hash-alg (258)
        const payloadHashAlg = headers.get(258);
        const payloadHashAlgId = toInt32(payloadHashAlg);
        if (payloadHashAlgId !== null) {
            const alg: AlgorithmInfo = { id: payloadHashAlgId, name: getHashAlgorithmName(payloadHashAlgId) };
            out.payloadHashAlgorithm = alg;
        }

        // preimage-content-type (259)
        const preimageContentType = headers.get(259);
        if (typeof preimageContentType === 'string') {
            out.preimageContentType = preimageContentType;
        }

        // payload-location (260)
        const payloadLocation = headers.get(260);
        if (typeof payloadLocation === 'string') {
            out.payloadLocation = payloadLocation;
        }

        return Object.keys(out).length > 0 ? { protectedHeaders: out } : undefined;
    }
};
