import type { PreviewSystem } from '../previewSystem';

export interface PreviewExtender {
    readonly id: string;
    register(system: PreviewSystem): void;
}
