import type { BytesPreview } from '../../core/bytesTypes';
import type { ValueType } from '../../core/valueTypes';
import type {
    CertificateInfo,
    CoseCertificateProtectedHeaderExtensions,
    CoseCertificateSignatureExtensions
} from '../certificates/coseCertificateTypes';

/**
 * Viewer inspection model for COSE_Sign1.
 *
 * This is intentionally NOT the RFC wire-structure type definition; it is a
 * contributor-extensible, JSON-safe model intended for display.
 */
export interface CoseInspectionResult {
    protectedHeaders?: ProtectedHeadersInfo;
    unprotectedHeaders?: HeaderInfo[];
    payload?: PayloadInfo;
    signature?: SignatureInfo;
    certificates?: CertificateInfo[];
}

export interface ProtectedHeadersInfo extends CoseCertificateProtectedHeaderExtensions {
    algorithm?: AlgorithmInfo;
    contentType?: string;
    criticalHeaders?: string[];
    payloadHashAlgorithm?: AlgorithmInfo;
    preimageContentType?: string;
    payloadLocation?: string;
    /**
     * Unknown / extension protected header parameters.
     *
     * These are emitted as dynamic properties on the object rather than in a
     * separate array so they appear where they are actually stored (protected headers).
     * Keys are typically the header label id (e.g. "394").
     */
    [headerLabel: string]: unknown;
}

export interface AlgorithmInfo {
    id: number;
    name: string;
}

export interface HeaderInfo {
    label?: string;
    labelId?: number;
    value?: unknown;
    valueType?: ValueType;
    lengthBytes?: number;
}

export interface PayloadInfo {
    isEmbedded: boolean;
    sizeBytes?: number;
    contentType?: string;
    isText?: boolean;
    bytes?: BytesPreview;
    sha256?: string;
    decoded?: unknown;
}

export interface SignatureInfo extends CoseCertificateSignatureExtensions {
    totalSizeBytes: number;
}
