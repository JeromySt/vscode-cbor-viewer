/**
 * @fileoverview Extender registration for CBOR date/time tags
 * (RFC 8949 Tags 0/1, RFC 8943 Tag 100, RFC 9277 Tags 1003/1004).
 */
import type { PrettyExtender } from '../prettyExtender';
import {
    DateObjectFormatter,
    DateOnlyFormatter,
    FullDateStringFormatter,
    DurationFormatter
} from './dateTimeFormatters';

export const prettyExtender: PrettyExtender = {
    id: 'date-time',
    register(registry, _labels, _previews): void {
        registry.register(DateObjectFormatter);
        registry.register(DateOnlyFormatter);
        registry.register(FullDateStringFormatter);
        registry.register(DurationFormatter);
    }
};
