# CBOR Viewer for Visual Studio Code

A Visual Studio Code extension for decoding and viewing CBOR-encoded files (Concise Binary Object Representation) as human-readable JSON.

In addition to generic CBOR, it understands all core COSE message types (Sign1, Sign, Encrypt0, Encrypt, Mac0, Mac), CBOR Sequences (RFC 8742), COSE countersignatures (RFC 9338), CBOR date/time tags, typed arrays, and CWT tokens — rendering an inspection-style JSON output optimized for troubleshooting.

## Features

- Automatic CBOR decoding for `.cbor`, `.cose`, and `.cbor-seq` files
- **CBOR Sequences (RFC 8742)**
  - Files containing multiple concatenated CBOR data items are decoded and displayed with indexed entries
  - Each element in the sequence is formatted independently (including COSE inspection per element)
  - Backward compatible: single-item files behave exactly as before
- **COSE Message Types (RFC 9052)**
  - COSE_Sign1 (Tag 18): single-signer signed messages
  - COSE_Sign (Tag 98): multi-signer signed messages with per-signer header inspection
  - COSE_Encrypt0 (Tag 16): single-recipient encrypted messages
  - COSE_Encrypt (Tag 96): multi-recipient encrypted messages with per-recipient inspection
  - COSE_Mac0 (Tag 17): single-recipient MAC messages
  - COSE_Mac (Tag 97): multi-recipient MAC messages with per-recipient inspection
  - All types show: protected headers, unprotected headers, algorithm names, payload info, and signature/tag/ciphertext details
  - Best-effort X.509 certificate parsing for `x5chain`/`x5bag`/`x5t` headers
  - Full COSE algorithm registry: ECDSA, EdDSA, RSASSA-PSS/PKCS1, AES-GCM/CCM/MAC/KW, HMAC, ECDH-ES/SS, ChaCha20/Poly1305
- **COSE Countersignatures (RFC 9338)**
  - Header label 11 (`CounterSignatureV2`): full countersignatures with decoded protected headers, algorithm name, and signature
  - Header label 12 (`CounterSignature0V2`): abbreviated countersignatures rendered as bytes preview
  - Header label 7 (v1 counter signature): also inspected with structure
  - CBOR tag 19 (`COSE_Countersignature`): standalone countersignatures decoded at the top level
- **CWT — CBOR Web Tokens (RFC 8392)**
  - Tag 61 (CWT): labeled wrapper with inner COSE message formatting
  - CWT claims (header 15): iss, sub, aud, exp, nbf, iat, cti
- **CBOR Date/Time Tags (RFC 8949, RFC 8943, RFC 9277)**
  - Tags 0/1: date/time string and epoch-based date/time with ISO 8601 rendering
  - Tag 100 (RFC 8943): date without time of day
  - Tag 1004 (RFC 9277): full date string
  - Tag 1003 (RFC 9277): duration with human-readable formatting
- **CBOR Typed Arrays (RFC 8746)**
  - Tags 64–87: typed arrays (uint8, int16, float32, float64, etc.) with element preview
- Deep/recursive expansion
  - Arrays, maps, and objects are recursively expanded
  - Embedded byte strings are probed for embedded CBOR and COSE_Sign1, anywhere in the document
- Large byte ergonomics
  - Byte strings render as compact preview objects (includes byte length plus `hexPreview`, and sometimes `textPreview`)
  - Clickable previews open the full bytes in the VS Code Hex Editor or as UTF-8 text (no temporary files)
- Decode actions
  - Decode selected base64/base64url text as CBOR
  - Decode selected hex text as CBOR
  - Decode bytes blobs as CBOR (including nested byte previews)
  - Decode bytes blobs as COSE headers (explicit intent)
  - For COSE_Sign1 documents, decode protected/unprotected headers from tuple parts
- Efficient large-file handling
  - Optional streaming decode for large local files to avoid a single large read into memory
- Two rendering modes
  - Pretty: inspection-style output (COSE-aware, embedded CBOR/COSE decode)
  - Raw: structure-oriented output (preserves CBOR map keys, no COSE prettification)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "CBOR Viewer"
4. Click Install

### From VSIX

1. Download the `.vsix` file from the [releases page](https://github.com/JeromySt/vscode-cbor-viewer/releases)
2. In VS Code, go to Extensions
3. Click the "..." menu and select "Install from VSIX..."
4. Select the downloaded file

## Usage

1. Open any `.cbor`, `.cose`, or `.cbor-seq` file in VS Code
2. The extension will automatically activate and display the decoded content
3. View the JSON representation in a read-only editor

### View modes (Pretty vs Raw)

- **Pretty** (default): produces an inspection-style JSON view that is optimized for humans. It includes COSE_Sign1-aware output and best-effort embedded CBOR/COSE decoding inside byte strings.
- **Raw**: focuses on representing the decoded CBOR structure faithfully. In particular, it preserves non-string map keys by rendering maps as entry arrays.

You can switch view modes from the viewer context menu.

### Working with byte strings

- Byte strings are shown as compact objects (for example: `{ "_type": "bytes", "lengthBytes": 524288, "hexPreview": "abab..." }`).
- Click `hexPreview` to open the full bytes in the Hex Editor.
- If a `textPreview` is shown, it can be opened as UTF-8 text.

### Decode as CBOR

In the JSON view, select or right-click values to decode as CBOR:

- Base64/base64url strings: decoded to bytes, then decoded as CBOR
- Hex strings: decoded to bytes, then decoded as CBOR
- Byte preview objects: you can decode the underlying bytes as CBOR

You can also use this feature in any editor (not just the CBOR Viewer):

- Select base64/base64url text, hex text, or a JSON byte array, then run **CBOR Viewer: Decode Selection as CBOR**.

This opens a new in-memory `.cbor` document in the CBOR Viewer.

### Decode as COSE headers

When you know a byte string represents a COSE header map (or you want to override heuristics), use **Decode as COSE Headers**.

- This opens a new in-memory CBOR document and forces the Pretty view to format the decoded value as COSE headers.
- When viewing a raw COSE_Sign1, you can also decode the **Protected Headers** or **Unprotected Headers** directly from the COSE_Sign1 tuple.

### Example

When you open a CBOR file, the extension will decode it and display the contents in a formatted JSON view. For COSE_Sign1 structures, you'll see:

```json
{
  "protectedHeaders": {
    "1": {
      "label": "alg (Algorithm)",
      "valueType": "map",
      "value": {
        "headerName": "alg (Algorithm)",
        "algorithmId": -7,
        "algorithmName": "ES256"
      }
    }
  },
  "payload": {
    "isEmbedded": true,
    "sizeBytes": 123,
    "isText": true,
    "bytes": {
      "_type": "bytes",
      "lengthBytes": 123,
      "hexPreview": "..."
    }
  },
  "signature": {
    "totalSizeBytes": 456
  }
}
```

## Supported File Types

- `.cbor` - Standard CBOR files
- `.cose` - COSE (CBOR Object Signing and Encryption) files
- `.cbor-seq` - CBOR Sequence files (RFC 8742)

## Development

### Pretty-view extensibility

The pretty view is implemented as an ordered formatter registry with a preview-hint system.

See the docs directory for architecture and extension guides:

- docs/architecture-overview.md
- docs/pretty-extenders.md
- docs/preview-extenders.md
- docs/how-to-extend.md

### Prerequisites

- Node.js 18+ 
- npm 9+
- Visual Studio Code 1.93.0+

### Building from Source

```bash
# Clone the repository
git clone https://github.com/JeromySt/vscode-cbor-viewer.git
cd vscode-cbor-viewer

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests
npm test

# Package extension
npx vsce package
```

### Running Tests

```bash
npm test

# Node-run unit tests (fast)
npm run test:unit

# Coverage (enforces line coverage threshold)
npm run test:coverage
```

## Release process

This repo publishes the extension to the VS Code Marketplace from GitHub Actions.

### Prerequisites (repo secrets)

- `VSCE_TOKEN`: a Visual Studio Marketplace Personal Access Token with permission to publish the extension.

### Steps

1. Ensure `package.json` version is bumped using SemVer.
2. Ensure `CHANGELOG.md` is up to date.
3. Run the GitHub Actions workflow **Create Release (tag + GitHub Release)** and (optionally) leave the version input blank (it uses `package.json`).
  - This creates a git tag `vX.Y.Z` and a GitHub Release.
4. When the Release is **published**, the **Publish Extension** workflow runs automatically:
  - Validates the tag matches `package.json` version
  - Runs `npm run test:coverage` (fails if coverage < 95%)
  - Packages a `.vsix` and publishes it to the Marketplace

### Linting

```bash
npm run lint
```

## Architecture

The extension consists of several key components:

- **extension.ts**: Main entry point that registers the custom editor provider
- **cborEditorProvider.ts**: Implements the custom readonly editor for CBOR files
- **cborDecoder.ts**: Core decoding logic (CBOR decode + COSE_Sign1 inspection + recursive expansion)
- **preview/inMemoryFileSystem.ts**: Read-only in-memory filesystem used for Hex Editor and decoded CBOR views without writing to disk

## Settings

### `cborViewer.streamingThresholdMiB`

- Type: number
- Default: 5
- Meaning: When opening a local `file:` resource larger than this size (in MiB), the extension uses a streaming CBOR parser instead of reading the full file into memory.
- Set to `0` to disable streaming (always read the full file).

Note: streaming is only used for local `file:` URIs. For remote/virtual schemes, VS Code only exposes `readFile()`, so the extension falls back to full-buffer decoding.

### `cborViewer.defaultViewMode`

- Type: string
- Default: `pretty`
- Values: `pretty` | `raw`
- Meaning: Controls which view mode the viewer starts in.

## Hex Editor dependency

This extension depends on the built-in VS Code Hex Editor extension (`ms-vscode.hexeditor`) for viewing byte blobs.

## Security

This extension is designed to be safe by default:

- Content Security Policy enforced on all webviews
- Input validation and error handling for decode operations
- No temporary files written for byte-blob viewing/decoding
- Webview scripts are loaded only from the extension's `media/` directory (no remote scripts)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Support

- 🐛 [Report a bug](https://github.com/JeromySt/vscode-cbor-viewer/issues)
- 💡 [Request a feature](https://github.com/JeromySt/vscode-cbor-viewer/issues)
- 📖 [Documentation](https://github.com/JeromySt/vscode-cbor-viewer)

## Related Standards

- [RFC 8949: CBOR (Concise Binary Object Representation)](https://www.rfc-editor.org/rfc/rfc8949.html)
- [RFC 8742: CBOR Sequences](https://www.rfc-editor.org/rfc/rfc8742.html)
- [RFC 9052: COSE Structures and Process](https://www.rfc-editor.org/rfc/rfc9052.html) — Sign1, Sign, Encrypt0, Encrypt, Mac0, Mac
- [RFC 9053: COSE Initial Algorithms](https://www.rfc-editor.org/rfc/rfc9053.html)
- [RFC 9338: COSE Countersignatures](https://www.rfc-editor.org/rfc/rfc9338.html)
- [RFC 9360: COSE Header Parameters for X.509 Certificates](https://www.rfc-editor.org/rfc/rfc9360.html)
- [RFC 8392: CBOR Web Token (CWT)](https://www.rfc-editor.org/rfc/rfc8392.html)
- [RFC 8943: CBOR Tags for Date without Time of Day](https://www.rfc-editor.org/rfc/rfc8943.html)
- [RFC 9277: CBOR Tags for Date/Time, Duration, and Period](https://www.rfc-editor.org/rfc/rfc9277.html)
- [RFC 8746: CBOR Tags for Typed Arrays](https://www.rfc-editor.org/rfc/rfc8746.html)
