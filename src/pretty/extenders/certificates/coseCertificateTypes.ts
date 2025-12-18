/**
 * Certificate-related COSE header extensions.
 *
 * These are NOT part of the COSE_Sign1 structure itself; they are defined by
 * COSE header parameters (x5t/x5chain/x5bag) and related conventions.
 */

export interface CertificateThumbprintInfo {
    algorithm?: string;
    value?: string;
}

export interface CertificateInfo {
    subject?: string;
    issuer?: string;
    serialNumber?: string;
    thumbprint?: string;
    notBefore?: string;
    notAfter?: string;
    isExpired?: boolean;
    keyAlgorithm?: string;
    signatureAlgorithm?: string;
}

export interface CoseCertificateProtectedHeaderExtensions {
    /** x5t (34) */
    certificateThumbprint?: CertificateThumbprintInfo;
    /** x5chain (33) length, when present. */
    certificateChainLength?: number;
    /** x5bag (32) length, when present. */
    certificateBagLength?: number;
}

export interface CoseCertificateSignatureExtensions {
    /** x5chain (33) location, when present. */
    certificateChainLocation?: 'protected' | 'unprotected';
    /** x5bag (32) location, when present. */
    certificateBagLocation?: 'protected' | 'unprotected';
}
