import type { PreviewGenerator } from '../../previews/previewGeneratorRegistry';
import { isLikelyUtf8Text } from '../../util';

const HEX_PREVIEW_BYTES = 20;
const TEXT_PREVIEW_BYTES = 100;

export const BytesPreviewGenerator: PreviewGenerator = {
    type: 'bytes',
    generate(kind, hint, _value, ctx): string | undefined {
        const bytes = ctx.blobs.get(hint.blobId);
        if (!bytes) {
            return undefined;
        }

        if (kind === 'hex') {
            const previewLen = Math.min(bytes.length, HEX_PREVIEW_BYTES);
            const preview = bytes.subarray(0, previewLen).toString('hex');
            const suffix = bytes.length > previewLen ? '...' : '';
            return `${preview}${suffix}`;
        }

        if (kind === 'text') {
            if (!isLikelyUtf8Text(bytes)) {
                return undefined;
            }
            const previewLen = Math.min(bytes.length, TEXT_PREVIEW_BYTES);
            let s = bytes.subarray(0, previewLen).toString('utf8');
            if (bytes.length > previewLen) {
                s += '...';
            }
            return s;
        }

        return undefined;
    }
};
