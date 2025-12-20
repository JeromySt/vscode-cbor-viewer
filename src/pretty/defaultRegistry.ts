/**
 * @fileoverview Default Registry (pretty pipeline).
 *
 * - Core pretty-formatting pipeline and infrastructure.
 * - Wires registries/extenders into a bounded, JSON-safe output shape.
 */
import { PrettyFormatterRegistry } from './registry';

/**
 * Default formatter registry.
 *
 * Why this returns an *empty* registry:
 * - The formatter set is intentionally supplied by extenders (see `loadBuiltInExtenders.ts`).
 * - This keeps core "plumbing" independent from domain behavior (COSE/CWT/SCITT/etc.).
 * - It also makes it easy to unit test: tests can register only the formatters they care about.
 *
 * Ordering is still important, but it lives with the extenders:
 * - Specific formatters first (lower `order`).
 * - Generic catch-all last.
 */
export function createDefaultPrettyFormatterRegistry(): PrettyFormatterRegistry {
    // Core registry is intentionally empty; extenders are discovered and registered
    // at runtime (including the generic CBOR fallback formatter).
    return new PrettyFormatterRegistry();
}
