import { X509Certificate } from 'crypto';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CertificateInfo, CertificateThumbprintInfo } from './coseCertificateTypes';
import { toInt32 } from '../../core/numeric';
import { getHashAlgorithmName } from '../../core/hashAlgorithms';
import { toBuffer } from '../../util';

type CoseCertificateInput = {
    _type: 'cose-certificates';
    protectedHeaders: Map<unknown, unknown>;
    unprotectedHeaders: Map<unknown, unknown> | null;
};

type CertificateExtResult = {
    protectedHeaders?: {
        certificateThumbprint?: CertificateThumbprintInfo;
        certificateChainLength?: number;
        certificateBagLength?: number;
    };
    signature?: {
        certificateChainLocation?: 'protected' | 'unprotected';
        certificateBagLocation?: 'protected' | 'unprotected';
    };
    certificates?: CertificateInfo[];
};

export const CoseCertificatesFormatter: PrettyFormatter = {
    id: 'cose-certificates',
    order: 130,
    canFormat(value: unknown): boolean {
        if (!value || typeof value !== 'object') {
            return false;
        }
        const v = value as Partial<CoseCertificateInput>;
        return v._type === 'cose-certificates' && v.protectedHeaders instanceof Map;
    },
    format(value: unknown, _ctx: PrettyFormatterContext): unknown {
        const v = value as CoseCertificateInput;

        const protectedHeaders = v.protectedHeaders;
        const unprotectedHeaders = v.unprotectedHeaders;

        const result: CertificateExtResult = {};

        const protectedExt: {
            certificateThumbprint?: CertificateThumbprintInfo;
            certificateChainLength?: number;
            certificateBagLength?: number;
        } = {};

        // Prefer protected header values, but allow fallback to unprotected.
        const x5t = protectedHeaders.get(34) ?? unprotectedHeaders?.get(34);
        if (Array.isArray(x5t) && x5t.length === 2) {
            const hashAlgId = toInt32(x5t[0]);
            const thumbBytes = toBuffer(x5t[1]);
            if (hashAlgId !== null && thumbBytes) {
                protectedExt.certificateThumbprint = {
                    algorithm: getHashAlgorithmName(hashAlgId),
                    value: thumbBytes.toString('hex').toUpperCase()
                };
            }
        }

        const x5chain = protectedHeaders.get(33) ?? unprotectedHeaders?.get(33);
        const chainLength = getCertificateChainLength(x5chain);
        if (chainLength !== null) {
            protectedExt.certificateChainLength = chainLength;
        }

        const x5bag = protectedHeaders.get(32) ?? unprotectedHeaders?.get(32);
        const bagLength = getCertificateChainLength(x5bag);
        if (bagLength !== null) {
            protectedExt.certificateBagLength = bagLength;
        }

        if (Object.keys(protectedExt).length > 0) {
            result.protectedHeaders = protectedExt;
        }

        const signatureExt: CertificateExtResult['signature'] = {};
        if (unprotectedHeaders?.has(33)) {
            signatureExt.certificateChainLocation = 'unprotected';
        } else if (protectedHeaders.has(33)) {
            signatureExt.certificateChainLocation = 'protected';
        }

        if (unprotectedHeaders?.has(32)) {
            signatureExt.certificateBagLocation = 'unprotected';
        } else if (protectedHeaders.has(32)) {
            signatureExt.certificateBagLocation = 'protected';
        }

        if (Object.keys(signatureExt).length > 0) {
            result.signature = signatureExt;
        }

        // Prefer x5chain, fall back to x5bag.
        const chainOrBag =
            protectedHeaders.get(33) ??
            unprotectedHeaders?.get(33) ??
            protectedHeaders.get(32) ??
            unprotectedHeaders?.get(32);

        const certs = extractCertificateChainBytes(chainOrBag);
        if (certs && certs.length > 0) {
            const parsed = parseCertificates(certs);
            if (parsed.length > 0) {
                result.certificates = parsed;
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
};

function parseCertificates(certs: Buffer[]): CertificateInfo[] {
    const results: CertificateInfo[] = [];
    for (const certBytes of certs) {
        try {
            const cert = new X509Certificate(certBytes);

            const notBefore = tryFormatUtc(cert.validFrom);
            const notAfter = tryFormatUtc(cert.validTo);

            const thumbprint = (cert.fingerprint ?? '').replaceAll(':', '').toUpperCase();

            const keyAlgorithm = (cert.publicKey as any)?.asymmetricKeyType;
            const signatureAlgorithm = (cert as any).signatureAlgorithm;

            const isExpired = (() => {
                const parsed = Date.parse(cert.validTo);
                return Number.isFinite(parsed) ? parsed < Date.now() : undefined;
            })();

            results.push({
                subject: cert.subject,
                issuer: cert.issuer,
                serialNumber: cert.serialNumber,
                thumbprint: thumbprint.length > 0 ? thumbprint : undefined,
                notBefore,
                notAfter,
                isExpired,
                keyAlgorithm: typeof keyAlgorithm === 'string' ? keyAlgorithm : undefined,
                signatureAlgorithm: typeof signatureAlgorithm === 'string' ? signatureAlgorithm : undefined
            });
        } catch {
            // Ignore parsing errors; do not break the entire view.
        }
    }
    return results;
}

function extractCertificateChainBytes(value: unknown): Buffer[] | undefined {
    const b = toBuffer(value);
    if (b) {
        return [b];
    }

    if (Array.isArray(value)) {
        const out: Buffer[] = [];
        for (const item of value) {
            const bi = toBuffer(item);
            if (bi) {
                out.push(bi);
            }
        }
        return out.length > 0 ? out : undefined;
    }

    return undefined;
}

function getCertificateChainLength(value: unknown): number | null {
    const b = toBuffer(value);
    if (b) {
        return 1;
    }
    if (Array.isArray(value)) {
        const count = value.filter(v => !!toBuffer(v)).length;
        return count > 0 ? count : null;
    }
    return null;
}

function tryFormatUtc(input: string): string | undefined {
    const t = Date.parse(input);
    if (!Number.isFinite(t)) {
        return undefined;
    }
    return formatDateUtc(new Date(t));
}

function formatDateUtc(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
}
