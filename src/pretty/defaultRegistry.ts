import { PrettyFormatterRegistry } from './registry';

/**
 * Default formatter registry.
 *
 * Add new formatters here.
 * Keep ordering intentional:
 * - Specific formatters first (lower `order`)
 * - Generic catch-all last
 */
export function createDefaultPrettyFormatterRegistry(): PrettyFormatterRegistry {
    // Core registry is intentionally empty; extenders are discovered and registered
    // at runtime (including the generic CBOR fallback formatter).
    return new PrettyFormatterRegistry();
}
