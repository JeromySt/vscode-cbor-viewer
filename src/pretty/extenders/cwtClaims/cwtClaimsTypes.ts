import type { ValueType } from '../../core/valueTypes';

export interface CwtClaimsInfo {
    issuer?: string;
    subject?: string;
    audience?: string;
    issuedAt?: string;
    issuedAtUnix?: number;
    notBefore?: string;
    notBeforeUnix?: number;
    expirationTime?: string;
    expirationTimeUnix?: number;
    isExpired?: boolean;
    cwtId?: string;
    customClaimsCount?: number;
    customClaims?: ClaimInfo[];
}

export interface ClaimInfo {
    label?: string;
    labelId?: number;
    value?: unknown;
    valueType?: ValueType;
    lengthBytes?: number;
}
