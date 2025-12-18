import type { PrettyExtender } from '../prettyExtender';
import { CoseHashMessageFormatter } from './coseHashMessageFormatter';
import { registerCoseHashMessageHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cose-hash-message',
    register(registry, labels, _previews): void {
        registerCoseHashMessageHeaderLabels(labels);
        registry.register(CoseHashMessageFormatter);
    }
};
