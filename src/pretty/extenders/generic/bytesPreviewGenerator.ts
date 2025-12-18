import type { PreviewGenerator } from '../../previews/previewGeneratorRegistry';

const HEX_PREVIEW_BYTES = 20;
const TEXT_PREVIEW_BYTES = 100;

function isLikelyText(data: Buffer): boolean {
    if (data.length === 0) {
        return false;
    }

    const sample = data.subarray(0, Math.min(1000, data.length));
    let printableCount = 0;
    for (const b of sample) {
        if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
            printableCount++;
        }
    }
    return printableCount > sample.length * 0.8;
}

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
            if (!isLikelyText(bytes)) {
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
