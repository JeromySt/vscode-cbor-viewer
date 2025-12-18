import type { PrettyExtender } from '../prettyExtender';
import { CwtClaimsFormatter } from './cwtClaimsFormatter';
import { registerCwtClaimLabels } from './cwtClaimsLabels';
import { registerCoseCwtClaimsHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cwt-claims',
    register(registry, labels, _previews): void {
        registerCwtClaimLabels(labels);
        registerCoseCwtClaimsHeaderLabels(labels);
        registry.register(CwtClaimsFormatter);
    }
};
