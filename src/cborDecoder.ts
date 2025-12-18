import * as cbor from 'cbor';

export interface CoseSign1 {
    protected: Record<string, unknown> | string;
    unprotected: Record<string, unknown>;
    payload: unknown;
    signature: string;
}

/**
 * Decode CBOR data to a JavaScript object
 * @param data Buffer containing CBOR-encoded data
 * @returns Decoded JavaScript object
 */
export async function decodeCbor(data: Uint8Array): Promise<any> {
    try {
        // Convert Uint8Array to Buffer for the cbor library
        const buffer = Buffer.from(data);
        
        // Decode the CBOR data
        const decoded = cbor.decodeFirstSync(buffer);
        
        // Try to detect and parse COSE structures
        if (Array.isArray(decoded) && decoded.length === 4) {
            // Might be a COSE_Sign1 structure
            return parseCoseSign1(decoded);
        }
        
        // Return the decoded data with Buffer objects converted to hex strings
        return convertBuffersToHex(decoded);
    } catch (error) {
        throw new Error(`Failed to decode CBOR data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Parse a COSE_Sign1 structure
 * COSE_Sign1 = [
 *     protected: bstr,
 *     unprotected: {* label => value},
 *     payload: bstr / nil,
 *     signature: bstr
 * ]
 */
function parseCoseSign1(data: unknown[]): unknown {
    if (data.length !== 4) {
        return convertBuffersToHex(data);
    }

    try {
        const result: CoseSign1 & { _type: string; payload_raw?: string } = {
            _type: 'COSE_Sign1',
            protected: {},
            unprotected: {},
            payload: null,
            signature: ''
        };

        // Parse protected headers (CBOR-encoded)
        if (Buffer.isBuffer(data[0])) {
            try {
                if (data[0].length > 0) {
                    result.protected = cbor.decodeFirstSync(data[0]);
                    result.protected = convertBuffersToHex(result.protected) as Record<string, unknown> | string;
                }
            } catch {
                result.protected = bufferToHex(data[0]);
            }
        } else {
            result.protected = convertBuffersToHex(data[0]) as Record<string, unknown> | string;
        }

        // Parse unprotected headers
        result.unprotected = convertBuffersToHex(data[1]) as Record<string, unknown>;

        // Parse payload (might be CBOR-encoded)
        if (data[2] === null || data[2] === undefined) {
            result.payload = null;
        } else if (Buffer.isBuffer(data[2])) {
            try {
                // Try to decode as CBOR
                const decodedPayload = cbor.decodeFirstSync(data[2]);
                result.payload = convertBuffersToHex(decodedPayload);
                result.payload_raw = bufferToHex(data[2]);
            } catch {
                // Not CBOR, just show as hex
                result.payload = bufferToHex(data[2]);
            }
        } else {
            result.payload = convertBuffersToHex(data[2]);
        }

        // Parse signature
        if (Buffer.isBuffer(data[3])) {
            result.signature = bufferToHex(data[3]);
        } else {
            result.signature = convertBuffersToHex(data[3]) as string;
        }

        return result;
    } catch (error) {
        // If parsing as COSE_Sign1 fails, return as regular array
        return convertBuffersToHex(data);
    }
}

/**
 * Convert Buffer to hex string
 */
function bufferToHex(buffer: Buffer): string {
    return buffer.toString('hex');
}

/**
 * Recursively convert all Buffer objects to hex strings
 */
function convertBuffersToHex(obj: unknown): string | Record<string, unknown> | unknown[] | unknown {
    if (Buffer.isBuffer(obj)) {
        return bufferToHex(obj);
    } else if (Array.isArray(obj)) {
        return obj.map(item => convertBuffersToHex(item));
    } else if (obj !== null && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = convertBuffersToHex((obj as Record<string, unknown>)[key]);
            }
        }
        return result;
    }
    return obj;
}
