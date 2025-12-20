/**
 * @fileoverview Label Registry (pretty pipeline).
 *
 * - Core pretty-formatting pipeline and infrastructure.
 * - Wires registries/extenders into a bounded, JSON-safe output shape.
 */
export type LabelKind = 'coseHeader' | 'cwtClaim';

export class LabelRegistry {
    private readonly labels = new Map<LabelKind, Map<number, string>>();

    register(kind: LabelKind, id: number, label: string): this {
        let byId = this.labels.get(kind);
        if (!byId) {
            byId = new Map();
            this.labels.set(kind, byId);
        }
        byId.set(id, label);
        return this;
    }

    get(kind: LabelKind, id: number): string | undefined {
        return this.labels.get(kind)?.get(id);
    }
}
