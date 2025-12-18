import type { PrettyExtender } from '../prettyExtender';
import { CoseSign1Formatter } from './coseSign1Formatter';
import { registerCoseBaseHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cose-sign1',
    register(registry, labels, _previews): void {
        registerCoseBaseHeaderLabels(labels);
        registry.register(CoseSign1Formatter);
    }
};
