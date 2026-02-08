/**
 * @fileoverview Extender registration for CBOR typed arrays (RFC 8746, Tags 64-87).
 */
import type { PrettyExtender } from '../prettyExtender';
import { TypedArrayFormatter } from './typedArrayFormatter';

export const prettyExtender: PrettyExtender = {
    id: 'typed-arrays',
    register(registry, _labels, _previews): void {
        registry.register(TypedArrayFormatter);
    }
};
