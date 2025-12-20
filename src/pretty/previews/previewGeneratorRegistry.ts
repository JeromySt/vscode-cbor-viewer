/**
 * @fileoverview Preview Generator Registry (pretty pipeline).
 *
 * - Core pretty-formatting pipeline and infrastructure.
 * - Wires registries/extenders into a bounded, JSON-safe output shape.
 */
import type { PreviewHint, PreviewHintKind, PreviewHints } from '../previewHints';

export interface PreviewGeneratorContext {
    blobs: Map<string, Buffer>;
}

/**
 * Generates preview *values* for a given object `_type` and preview hint.
 *
 * The generated values are ordinary string fields (e.g. `hexPreview`) that the
 * webview can display; `_previewHints` only describes how those strings should
 * be linkified/opened.
 */
export interface PreviewGenerator {
    /** Object `_type` this generator applies to (e.g. 'bytes'). */
    readonly type: string;
    generate(kind: PreviewHintKind, hint: PreviewHint, value: Record<string, unknown>, ctx: PreviewGeneratorContext): string | undefined;
}

export class PreviewGeneratorRegistry {
    private readonly byType = new Map<string, PreviewGenerator[]>();

    register(generator: PreviewGenerator): this {
        const list = this.byType.get(generator.type) ?? [];
        list.push(generator);
        this.byType.set(generator.type, list);
        return this;
    }

    /**
     * Walks the model and materializes preview fields based on `_previewHints`.
     *
     * This mutates objects in-place (safe for our decoded model).
     */
    generatePreviewsInPlace(value: unknown, blobs: Map<string, Buffer>): void {
        const ctx: PreviewGeneratorContext = { blobs };
        const seen = new Set<unknown>();

        const visit = (v: unknown): void => {
            if (!v || typeof v !== 'object') {
                return;
            }
            if (seen.has(v)) {
                return;
            }
            seen.add(v);

            if (Array.isArray(v)) {
                for (const item of v) {
                    visit(item);
                }
                return;
            }

            const obj = v as Record<string, unknown>;
            const type = typeof obj._type === 'string' ? (obj._type as string) : undefined;
            const hints = obj._previewHints as unknown;

            if (type && hints && typeof hints === 'object' && !Array.isArray(hints)) {
                const generators = this.byType.get(type) ?? [];
                for (const [fieldName, hintValue] of Object.entries(hints as PreviewHints)) {
                    if (obj[fieldName] !== undefined) {
                        continue;
                    }

                    const hint = hintValue as unknown as PreviewHint;
                    if (!hint || typeof hint !== 'object') {
                        continue;
                    }
                    const kind = (hint as any).kind as PreviewHintKind;
                    const blobId = (hint as any).blobId as unknown;
                    if ((kind !== 'hex' && kind !== 'text') || typeof blobId !== 'string') {
                        continue;
                    }

                    for (const g of generators) {
                        const generated = g.generate(kind, hint, obj, ctx);
                        if (typeof generated === 'string') {
                            obj[fieldName] = generated;
                            break;
                        }
                    }
                }
            }

            for (const child of Object.values(obj)) {
                visit(child);
            }
        };

        visit(value);
    }
}
