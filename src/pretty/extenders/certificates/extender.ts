import type { PrettyExtender } from '../prettyExtender';
import { CoseCertificatesFormatter } from './coseCertificatesFormatter';
import { registerCoseCertificateHeaderLabels } from './coseHeaderLabels';

export const prettyExtender: PrettyExtender = {
    id: 'cose-certificates',
    register(registry, labels, _previews): void {
        registerCoseCertificateHeaderLabels(labels);
        registry.register(CoseCertificatesFormatter);
    }
};
