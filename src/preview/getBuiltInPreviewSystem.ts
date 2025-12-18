import { PreviewSystem } from './previewSystem';
import { registerBuiltInPreviewExtenders } from './extenders/loadBuiltInPreviewExtenders';

let builtIn: PreviewSystem | undefined;

export function getBuiltInPreviewSystem(): PreviewSystem {
    if (!builtIn) {
        builtIn = new PreviewSystem();
        registerBuiltInPreviewExtenders(builtIn);
    }
    return builtIn;
}
