import type { PrettyExtender } from '../prettyExtender';
import { GenericCborFormatter } from './genericCborFormatter';
import { BytesPreviewGenerator } from './bytesPreviewGenerator';

export const prettyExtender: PrettyExtender = {
    id: 'generic',
    register(registry, _labels, previews): void {
        registry.register(GenericCborFormatter);
        previews.register(BytesPreviewGenerator);
    }
};
