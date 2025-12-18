import type { BytesPreview } from '../../core/bytesTypes';
import type { ValueType } from '../../core/valueTypes';
import type { CwtClaimsInfo } from '../cwtClaims/cwtClaimsTypes';
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
    cwtClaims?: CwtClaimsInfo;
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
    otherHeaders?: HeaderInfo[];
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
