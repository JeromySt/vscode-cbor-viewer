/**
 * @fileoverview Cose Certificates Formatter (pretty extender).
 *
 * - Contributes pretty-formatting behavior for a specific domain (COSE/CWT/SCITT/etc.).
 * - Registers formatters, labels, and preview generators with the core pipeline.
 * - Ordering matters: prefer specific formatters over generic ones.
 */
import { X509Certificate } from 'crypto';
import type { PrettyFormatter, PrettyFormatterContext } from '../../registry';
import type { CertificateInfo } from './coseCertificateTypes';
import type { ValueType } from '../../core/valueTypes';
import { toInt32 } from '../../core/numeric';
import { getHashAlgorithmName } from '../../core/hashAlgorithms';
import { toBuffer } from '../../util';

type CoseCertificateInput = {
    _type: 'cose-certificates';
    protectedHeaders: Map<unknown, unknown>;
    unprotectedHeaders: Map<unknown, unknown> | null;
};

type CertificateExtResult = {
    protectedHeaders?: Record<string, { valueType?: ValueType; value?: unknown }>;
    unprotectedHeaders?: Record<string, { valueType?: ValueType; value?: unknown }>;
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
    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        const v = value as CoseCertificateInput;

        const protectedHeaders = v.protectedHeaders;
        const unprotectedHeaders = v.unprotectedHeaders;

        const result: CertificateExtResult = {};

        // x5t (34)
        if (protectedHeaders.has(34)) {
            addX5tParsedValue(result, ctx, 'protected', protectedHeaders.get(34));
        }
        if (unprotectedHeaders?.has(34)) {
            addX5tParsedValue(result, ctx, 'unprotected', unprotectedHeaders.get(34));
        }

        // x5chain (33)
        if (protectedHeaders.has(33)) {
            addX5ChainOrBagParsedValue(result, ctx, 'protected', '33', protectedHeaders.get(33), 'chain');
        }
        if (unprotectedHeaders?.has(33)) {
            addX5ChainOrBagParsedValue(result, ctx, 'unprotected', '33', unprotectedHeaders.get(33), 'chain');
        }

        // x5bag (32)
        if (protectedHeaders.has(32)) {
            addX5ChainOrBagParsedValue(result, ctx, 'protected', '32', protectedHeaders.get(32), 'bag');
        }
        if (unprotectedHeaders?.has(32)) {
            addX5ChainOrBagParsedValue(result, ctx, 'unprotected', '32', unprotectedHeaders.get(32), 'bag');
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }
};

function addX5tParsedValue(
    result: CertificateExtResult,
    ctx: PrettyFormatterContext,
    location: 'protected' | 'unprotected',
    raw: unknown
): void {
    if (!Array.isArray(raw) || raw.length !== 2) {
        return;
    }

    const hashAlgId = toInt32(raw[0]);
    const thumbBytes = toBuffer(raw[1]);
    if (hashAlgId === null || !thumbBytes) {
        return;
    }

    const parsed: {
        headerName: string;
        hashAlgorithmId: number;
        algorithm?: string;
        value: string;
    } = {
        headerName: ctx.labels.getCoseHeaderName(34),
        hashAlgorithmId: hashAlgId,
        algorithm: getHashAlgorithmName(hashAlgId),
        value: thumbBytes.toString('hex').toUpperCase()
    };

    addContribution(result, location, '34', { valueType: 'map', value: parsed });
}

function addX5ChainOrBagParsedValue(
    result: CertificateExtResult,
    ctx: PrettyFormatterContext,
    location: 'protected' | 'unprotected',
    labelKey: '32' | '33',
    raw: unknown,
    kind: 'chain' | 'bag'
): void {
    const length = getCertificateChainLength(raw);
    if (length === null) {
        return;
    }

    const certs = extractCertificateChainBytes(raw);
    const parsedCerts = certs ? parseCertificates(certs) : [];

    const parsed: any = {};
    parsed.headerName = ctx.labels.getCoseHeaderName(labelKey === '33' ? 33 : 32);
    if (kind === 'chain') {
        parsed.chainLength = length;
    } else {
        parsed.bagLength = length;
    }
    if (parsedCerts.length > 0) {
        parsed.certificates = parsedCerts;
    }

    addContribution(result, location, labelKey, { valueType: 'map', value: parsed });
}

function addContribution(
    result: CertificateExtResult,
    location: 'protected' | 'unprotected' | undefined,
    labelKey: string,
    patch: { valueType?: ValueType; value?: unknown }
): void {
    if (!location) {
        return;
    }

    if (location === 'protected') {
        if (!result.protectedHeaders) {
            result.protectedHeaders = {};
        }
        result.protectedHeaders[labelKey] = patch;
    } else {
        if (!result.unprotectedHeaders) {
            result.unprotectedHeaders = {};
        }
        result.unprotectedHeaders[labelKey] = patch;
    }
}

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
