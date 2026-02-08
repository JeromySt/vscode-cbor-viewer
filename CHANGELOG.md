# Change Log

All notable changes to the "CBOR Viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0]

### Added
- **COSE_Sign (Tag 98, RFC 9052)**: multi-signer COSE signed messages with per-signer header inspection
- **COSE_Encrypt0 (Tag 16, RFC 9052)**: single-recipient COSE encrypted messages with algorithm and ciphertext info
- **COSE_Encrypt (Tag 96, RFC 9052)**: multi-recipient COSE encrypted messages with per-recipient inspection
- **COSE_Mac0 (Tag 17, RFC 9052)**: single-recipient COSE MAC messages with payload and tag info
- **COSE_Mac (Tag 97, RFC 9052)**: multi-recipient COSE MAC messages with per-recipient inspection
- **Expanded COSE algorithm registry (RFC 9053)**: AES-GCM, AES-CCM, AES-MAC, AES-KW, HMAC, ECDH-ES/SS, ChaCha20/Poly1305, direct key agreement
- **CWT Tag 61 (RFC 8392)**: CBOR Web Token wrapper with inner COSE message formatting
- **CBOR Date/Time Tags**: Tags 0/1 (RFC 8949), Tag 100 (RFC 8943), Tags 1003/1004 (RFC 9277) with human-readable rendering
- **CBOR Typed Arrays (RFC 8746)**: Tags 64–87 with element type, count, and value preview
- Test fixtures for all new COSE message types, CWT, date/time tags, and typed arrays

### Changed
- Refactored shared COSE inspection logic into `src/pretty/core/coseMessageCommon.ts` for reuse across all COSE message types
- Countersignature header labels 11/12 now registered by the countersignature extender (consistent with other extension-specific labels)

## [0.6.0]

### Added
- **CBOR Sequences (RFC 8742)**: files containing multiple concatenated CBOR data items are now decoded and displayed with indexed entries; each element is formatted independently (including COSE inspection per element)
- **COSE Countersignatures (RFC 9338)**: pretty-printing support for countersignature header parameters
  - Header label 11 (`CounterSignatureV2`): full countersignatures with decoded protected headers, algorithm name, and signature
  - Header label 12 (`CounterSignature0V2`): abbreviated countersignatures rendered as bytes preview
  - Header label 7 (v1 counter signature): structure-aware inspection
  - CBOR tag 19 (`COSE_Countersignature`): standalone countersignatures decoded at the top level
- `.cbor-seq` file extension support in the custom editor
- Test fixture files for CBOR sequences (`simple-sequence.cbor-seq`, `mixed-types-sequence.cbor-seq`, `cose-sequence.cbor-seq`)
- Unit tests for CBOR Sequences and COSE Countersignatures

### Changed
- Streaming decode for large files now collects all CBOR items (supports sequences)
- Empty CBOR data now throws a descriptive error instead of silently failing

### Fixed
- Incorrect RFC 9338 reference in the COSE Hash Envelope extender (headers 258-260 are from draft-ietf-cose-hash-envelope, not RFC 9338)

## [0.5.0] - 2025-12-23

<!-- cbor-viewer:pr-summary:start -->
_Source: Auto-generated from git diff (Copilot summary not found)_

- Code changes in 1 file(s)
- Touched: src/cborEditorProvider.ts
<!-- cbor-viewer:pr-summary:end -->

## [0.1.4-preview] - 2025-12-19

### Added
- Rich file-level documentation (`@fileoverview`) and intent-focused JSDoc across the codebase

### Fixed
- CWT custom claims whose values are maps now reliably include an expanded `value` (previously could be omitted when a heuristic formatter returned `undefined`)

## [0.1.3-preview] - 2025-12-19

### Added
- Extender-based architecture for both pretty rendering and preview UX (commands + webview actions)
- Dynamic, registry-driven preview hint kinds powering webview linkification and context menu actions
- Decode-as-COSE-headers action (explicit intent) for byte blobs/strings and selection flows
- Context-aware COSE_Sign1 header-part decoding actions (decode protected/unprotected headers directly from tuple parts)
- COSE algorithm id/name projection and richer COSE header-map formatting (including CWT claims under header label 15)
- Strict unit-test coverage gate (`npm run test:coverage` enforces 95% line coverage)

### Changed
- Webview behavior no longer relies on hard-coded link classes; it is driven by serialized preview hint kind configuration
- Build output is cleaned before compilation to avoid stale artifacts (`npm run compile` removes `out/` first)
- CWT custom claims are represented as a keyed object rather than an array

### Fixed
- Webview context menu hit-testing and positioning (actions apply to the element under the cursor)
- COSE protected header bytes are formatted as COSE headers before any CWT-claims heuristics (prevents misclassification)
- `textPreview` is only emitted when bytes are likely text (no noisy previews for binary payloads)

## [0.1.0] - 2025-12-18

### Added
- Initial release of CBOR Viewer extension
- Support for viewing `.cbor` files as JSON
- Support for viewing `.cose` files as JSON
- COSE_Sign1 structure detection and parsing
- CBOR tag 18 support for COSE_Sign1
- Recursive expansion of arrays/maps/objects, including embedded CBOR/COSE within byte strings
- Custom read-only editor for CBOR files
- Syntax highlighting for JSON output
- Compact byte preview objects (includes `hexPreview`) for large/unprocessable byte strings
- Clickable `hexPreview` links that open the full bytes in the Hex Editor
- Decode-as-CBOR actions for selected base64/base64url strings, hex strings, and bytes blobs
- In-memory virtual filesystem for hex viewing (no temporary files written to disk)
- Large local file streaming decode option controlled by `cborViewer.streamingThresholdMiB`
- Comprehensive test suite with unit tests
- ESLint configuration for code quality
- TypeScript support with strict mode
- Security features including CSP for webviews
- Documentation (README, CONTRIBUTING, CHANGELOG)
- GPL-3.0 license

### Security
- Content Security Policy enforced on webviews
- Input validation and error handling
- No external script loading
- Nonce-based script execution
