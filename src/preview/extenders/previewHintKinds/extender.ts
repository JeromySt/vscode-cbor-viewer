import type { PreviewExtender } from '../previewExtender';
import { HEX_TOKEN, PAYLOAD_TOKEN } from '../../previewHintTokens';

export const previewExtender: PreviewExtender = {
    id: 'preview-hint-kinds',
    register(system): void {
        system.registerPreviewHintKind({
            kind: 'hex',
            token: HEX_TOKEN,
            cssClass: 'hex-preview-link',
            onClickMessage: { type: 'openHexBlob', blobId: '$blobId' },
            contextMenuItems: [
                { label: 'Open in Hex Editor', message: { type: 'openHexBlob', blobId: '$blobId' } },
                { label: 'Decode as CBOR', message: { type: 'decodeAsCbor', kind: 'blobId', blobId: '$blobId' } }
            ]
        });

        system.registerPreviewHintKind({
            kind: 'text',
            token: PAYLOAD_TOKEN,
            cssClass: 'payload-preview-link',
            onClickMessage: { type: 'openTextBlob', blobId: '$blobId' },
            contextMenuItems: [
                { label: 'Open as Text', message: { type: 'openTextBlob', blobId: '$blobId' } },
                { label: 'Open in Hex Editor', message: { type: 'openHexBlob', blobId: '$blobId' } },
                { label: 'Decode as CBOR', message: { type: 'decodeAsCbor', kind: 'blobId', blobId: '$blobId' } }
            ],
            truncateChars: 120,
            titleIsFullValue: true
        });
    }
};
