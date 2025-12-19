# Change Log

All notable changes to the "CBOR Viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- cbor-viewer:pr-summary:start -->
_Source: Auto-generated from git diff (Copilot summary not found)_

- Code changes in 21 file(s)
- Test updates in 10 file(s)
- Docs updates in 1 file(s)
- Other changes in 1 file(s)
- Touched: README.md, media/cborViewerWebview.js, package.json, src/cborDecoder.ts, src/cborEditorProvider.ts, src/pretty/core/coseAlgorithms.ts, src/pretty/extenders/certificates/coseCertificateTypes.ts, src/pretty/exten
<!-- cbor-viewer:pr-summary:end -->

## [1.2.0-preview] - 2025-12-18

### Added
- Extender-based architecture for both pretty rendering and preview UX (commands + webview actions)
- Dynamic, registry-driven preview hint kinds powering webview linkification and context menu actions
- Strict unit-test coverage gate (`npm run test:coverage` enforces 95% line coverage)
- Unicode-aware UTF-8 text detection for conditional `textPreview`

### Changed
- Webview behavior no longer relies on hard-coded link classes; it is driven by serialized preview hint kind configuration
- Build output is cleaned before compilation to avoid stale artifacts (`npm run compile` removes `out/` first)

### Fixed
- `textPreview` is only emitted when bytes are likely text (no noisy text previews for binary payloads)

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
