# CBOR Viewer for Visual Studio Code

A Visual Studio Code extension for decoding and viewing CBOR-encoded files (Concise Binary Object Representation) as human-readable JSON. Designed with support for COSE structures such as COSE_Sign1, this extension makes it easy to inspect payloads, headers, and signatures directly inside VSCode.

## Features

- 🔍 **Automatic CBOR Decoding**: Opens `.cbor` and `.cose` files and automatically decodes them to JSON
- 📊 **COSE Support**: Special handling for COSE_Sign1 structures with clear separation of protected headers, unprotected headers, payload, and signature
- 🎨 **Syntax Highlighting**: JSON output with color-coded syntax highlighting
- 🔒 **Secure**: Built with security best practices, including Content Security Policy for webviews
- 🧪 **Well Tested**: Comprehensive test suite ensuring reliability

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

1. Open any `.cbor` or `.cose` file in VS Code
2. The extension will automatically activate and display the decoded content
3. View the JSON representation in a read-only editor

### Example

When you open a CBOR file, the extension will decode it and display the contents in a formatted JSON view. For COSE_Sign1 structures, you'll see:

```json
{
  "_type": "COSE_Sign1",
  "protected": {
    "alg": "ES256"
  },
  "unprotected": {
    "kid": "key-identifier"
  },
  "payload": {
    "data": "decoded payload"
  },
  "signature": "3045022100..."
}
```

## Supported File Types

- `.cbor` - Standard CBOR files
- `.cose` - COSE (CBOR Object Signing and Encryption) files

## Development

### Prerequisites

- Node.js 18+ 
- npm 9+
- Visual Studio Code 1.85.0+

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
```

### Linting

```bash
npm run lint
```

## Architecture

The extension consists of several key components:

- **extension.ts**: Main entry point that registers the custom editor provider
- **cborEditorProvider.ts**: Implements the custom readonly editor for CBOR files
- **cborDecoder.ts**: Core decoding logic with COSE_Sign1 detection

## Security

This extension is built with security as a priority:

- ✅ Content Security Policy enforced on all webviews
- ✅ Input validation and error handling
- ✅ No arbitrary code execution
- ✅ Regular security audits via GitHub CodeQL
- ✅ Dependency vulnerability scanning

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
- [RFC 8152: COSE (CBOR Object Signing and Encryption)](https://www.rfc-editor.org/rfc/rfc8152.html)
