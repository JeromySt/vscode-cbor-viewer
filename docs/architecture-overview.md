# Architecture Overview

This extension is structured around a **minimal core** plus two **dynamic extender systems**:

1. **Pretty system**: turns decoded CBOR values into a JSON-safe, human-friendly model.
2. **Preview system**: contributes UX actions (commands + webview message handlers) such as “open hex”, “open text”, and “decode as CBOR”.

The intent is that *most* behavior lives in small, independently-owned extenders, not in the core.

---

## Big picture

### Core responsibilities

- Activate the extension and register the custom editor.
- Decode CBOR bytes into (pretty, raw) views.
- Maintain blob storage (bytes) used by the webview for “open hex/text” actions.
- Enforce webview security constraints (CSP, sanitization, message validation).

### Extender responsibilities

- **Pretty extenders**:
  - Add domain/spec-aware formatters (COSE, CWT, SCITT, etc.).
  - Add label registries (known header ids / claim ids).
  - Add preview generators that materialize user-visible preview fields from preview hints.

- **Preview extenders**:
  - Register VS Code commands.
  - Register webview message handlers (open hex blob, open text blob, decode as CBOR, etc.).
  - Register preview-hint kinds that control how the webview linkifies values and which context menu actions are offered.

---

## Activation & registration flow (sequence)

```mermaid
sequenceDiagram
  participant VS as VS Code
  participant EXT as Extension Host
  participant ACT as activate()
  participant FS as InMemoryFileSystemProvider
  participant PS as PreviewSystem (built-in)
  participant CEP as CborEditorProvider

  VS->>EXT: activation event (custom editor / command)
  EXT->>ACT: call activate(context)

  ACT->>FS: new InMemoryFileSystemProvider('cborViewerMem')
  ACT->>EXT: registerFileSystemProvider('cborViewerMem', FS)

  ACT->>PS: getBuiltInPreviewSystem()
  PS->>PS: loadBuiltInPreviewExtenders() (scan extenders/*/extender)
  ACT->>PS: activateCommands(context, FS)

  ACT->>CEP: new CborEditorProvider(context, FS)
  ACT->>EXT: registerCustomEditorProvider('cborViewer.editor', CEP)
```

Notes:
- The activation entrypoint must remain as `src/extension.ts` because VS Code loads the compiled `out/extension.js`.
- The *behavior* registered during activation is intentionally delegated to the preview system.

---

## Custom editor open & render flow (sequence)

```mermaid
sequenceDiagram
  participant VS as VS Code
  participant CEP as CborEditorProvider
  participant DEC as cborDecoder.decodeCborWithViews
  participant PV as Pretty View (buildPrettyView)
  participant PR as Pretty Formatter Registry
  participant PExt as Pretty Extenders
  participant WV as Webview Script
  participant PVS as PreviewSystem
  participant PVExt as Preview Extenders

  VS->>CEP: resolveCustomEditor(document, webviewPanel)
  CEP->>CEP: decodeDocument(uri)
  CEP->>DEC: decode bytes

  DEC->>PV: buildPrettyView(decoded, totalSizeBytes)
  PV->>PExt: registerBuiltInExtenders() (scan extenders/*/extender)
  PV->>PR: registry.format(root)
  PR->>PR: first-match wins by order
  PR-->>PV: JSON-safe pretty model + _previewHints
  PV-->>DEC: pretty model
  DEC-->>CEP: { pretty, raw, blobs }

  CEP->>CEP: sanitizeForWebview(model)
  CEP->>WV: postMessage({type:'setJson', ...})

  WV->>WV: render JSON + linkify preview tokens

  WV->>CEP: postMessage(openHexBlob/openTextBlob/decodeAsCbor)
  CEP->>PVS: handleWebviewMessage(message, {memFs, blobs})
  PVS->>PVExt: dispatch to matching message handler(s)
  PVExt-->>VS: executeCommand/openTextDocument/openWith
```

---

## Webview safety model

Key constraints:

- The model sent to the webview must be **JSON-safe**.
- Internal blob IDs must not be directly exposed in a way that lets the webview request arbitrary blobs.

Mechanism:

- The model contains `_previewHints` describing which fields should be “openable” and which blob id they map to.
- `sanitizeForWebview()` converts those hints into *tokenized strings* suitable for linkification, then strips `_previewHints` and other internal fields.

This keeps the webview rendering logic simple while keeping the core model extensible and safe.

---

## Extension points (summary)

- Pretty:
  - Formatter registry (ordered, first match wins)
  - Label registry contributions
  - Preview generator registry contributions

- Preview:
  - Command registrations
  - Webview message handlers

For step-by-step guides, see:

- `docs/pretty-extenders.md`
- `docs/preview-extenders.md`
- `docs/how-to-extend.md`
