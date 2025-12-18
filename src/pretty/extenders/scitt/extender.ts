import type { PrettyExtender } from '../prettyExtender';
import { registerScittHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'scitt',
    register(_registry, labels, _previews): void {
        registerScittHeaderLabels(labels);
    }
};
