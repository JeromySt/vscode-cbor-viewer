# Change Log

All notable changes to the "CBOR Viewer" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
<!-- cbor-viewer:pr-summary:start -->
_Source: Auto-generated from git diff (Copilot summary not found)_

- Code changes in 5 file(s)
- Test updates in 7 file(s)
- Docs updates in 3 file(s)
- CI/workflow updates in 3 file(s)
- Other changes in 7 file(s)
- Touched: .github/workflows/ci.yml, .github/workflows/publish.yml, .github/workflows/release.yml, .gitignore, CHANGELOG.md, CONTRIBUTING.md, README.md, media/cborViewerWebview.js
<!-- cbor-viewer:pr-summary:end -->

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
