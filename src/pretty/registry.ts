export interface PrettyFormatterContext {
    /** Current recursion depth (0 is top). */
    depth: number;
    /** Maximum depth allowed for expanding nested structures and embedded decode. */
    maxDepth: number;
    /** Total size (bytes) of the CBOR item being presented, when known. */
    totalSizeBytes?: number;

    /** Recurse: format a value using the registry. */
    format(value: unknown, depth?: number): unknown;

    /** Recurse but apply depth-limit behavior (no embedded decode). */
    formatAtDepthLimit(value: unknown): unknown;

    /**
     * Attempt to decode embedded CBOR from a byte string.
     * Returns undefined if decoding is not possible/safe.
     */
    tryDecodeEmbedded(bytes: Buffer, nextDepth: number): unknown | undefined;

    /** Produce a bytes preview object and register blob handles. */
    bytesPreview(bytes: Buffer, existingBlobId?: string): unknown;

    /** Extensible label lookup for known header/claim ids. */
    labels: {
        getCoseHeaderName(labelId: number | null): string;
        getCwtClaimName(labelId: number | null): string;
    };
}

export interface PrettyFormatter {
    /** Stable id for debug/docs. */
    readonly id: string;
    /** Lower runs earlier. Default 1000. */
    readonly order?: number;
    canFormat(value: unknown, ctx: PrettyFormatterContext): boolean;
    format(value: unknown, ctx: PrettyFormatterContext): unknown;
}

export class PrettyFormatterRegistry {
    private readonly formatters: PrettyFormatter[] = [];

    register(formatter: PrettyFormatter): this {
        this.formatters.push(formatter);
        this.formatters.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));
        return this;
    }

    format(value: unknown, ctx: PrettyFormatterContext): unknown {
        for (const f of this.formatters) {
            if (f.canFormat(value, ctx)) {
                return f.format(value, ctx);
            }
        }
        // Registry should always include a catch-all formatter.
        return value;
    }
}
