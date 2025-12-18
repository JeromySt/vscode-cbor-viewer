# Contributing to CBOR Viewer

Thank you for your interest in contributing to CBOR Viewer! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- VS Code version and extension version
- Sample CBOR file (if applicable and not sensitive)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please create an issue with:

- A clear, descriptive title
- Detailed description of the proposed feature
- Use cases and benefits
- Any relevant examples or mockups

### Pull Requests

1. **Fork the repository** and create a new branch from `main`
2. **Make your changes**:
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed
3. **Test your changes**:
   ```bash
   npm run compile
   npm run lint
   npm test
   ```
4. **Commit your changes**:
   - Use clear, descriptive commit messages
   - Reference any related issues
5. **Push to your fork** and submit a pull request

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Visual Studio Code 1.85.0 or higher
- Git

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/vscode-cbor-viewer.git
cd vscode-cbor-viewer

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests
npm test

# Watch mode for development
npm run watch
```

### Testing the Extension

1. Open the project in VS Code
2. Press F5 to launch the Extension Development Host
3. Open a `.cbor` or `.cose` file to test the extension

### Project Structure

```
vscode-cbor-viewer/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── cborEditorProvider.ts  # Custom editor implementation
│   ├── cborDecoder.ts         # CBOR decoding logic
│   ├── inMemoryFileSystem.ts  # In-memory FS (hex viewing without disk writes)
│   └── test/
│       ├── runTest.ts         # Test runner
│       └── suite/
│           ├── index.ts       # Test suite setup
│           └── *.test.ts      # Test files
├── test/
│   └── fixtures/              # Test CBOR files
├── package.json               # Extension manifest
├── tsconfig.json             # TypeScript configuration
└── eslint.config.mjs         # ESLint configuration
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Provide type annotations for public APIs
- Avoid `any` types when possible
- Use ES2022 features

### Code Style

- Follow the existing code style
- Use 4 spaces for indentation
- Use single quotes for strings
- Run `npm run lint` before committing

### Testing

- Write tests for new features
- Maintain or improve code coverage
- Test edge cases and error conditions
- Use descriptive test names

### Documentation

- Update README.md for user-facing changes
- Add inline comments for complex logic
- Update CHANGELOG.md with all changes
- Document new APIs and functions

If you add a new setting, update `package.json` contributes.configuration and document it in README.md.

## Security

### Reporting Security Issues

If you discover a security vulnerability, please email the maintainers directly instead of creating a public issue. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fixes (if any)

### Security Best Practices

- Never commit sensitive data or credentials
- Validate all inputs
- Use Content Security Policy for webviews
- Follow principle of least privilege
- Keep dependencies up to date

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` with all changes
3. Create a git tag: `git tag v0.1.0`
4. Push tag: `git push origin v0.1.0`
5. GitHub Actions will automatically build and publish

## Questions?

If you have questions about contributing, feel free to:

- Open an issue for discussion
- Check existing issues and pull requests
- Review the project documentation

## License

By contributing to CBOR Viewer, you agree that your contributions will be licensed under the GNU General Public License v3.0.

Thank you for contributing! 🎉
