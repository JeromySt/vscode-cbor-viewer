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
