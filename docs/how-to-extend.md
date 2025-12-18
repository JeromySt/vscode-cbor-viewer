# How to Extend This Extension (Contributor Guide)

This is a hands-on, “do this, then this” guide for extending the extension.

If you’re new, read `docs/architecture-overview.md` first.

---

## Extending pretty rendering

### Goal

Add a spec-aware rendering for a new CBOR structure (or a new projection of an existing one).

### Choose the right extension point

- **New CBOR structure recognition** → add a new `PrettyFormatter`.
- **New numeric label names** (COSE headers / CWT claims) → add label registrations.
- **New preview fields** derived from blobs → add a `PreviewGenerator`.

### Steps

1) Create a new folder:

- `src/pretty/extenders/<yourExtender>/`

2) Add `extender.ts` exporting `prettyExtender`.

3) Implement formatter(s) and register them.

4) (Optional) register labels.

5) (Optional) register preview generators.

6) Add unit tests in `src/test/unit/cborDecoder.views.unit.test.ts` (or a new `.unit.test.ts`).

7) Run `npm run test:coverage` until it passes.

### Rules

- Return **JSON-safe** output only.
- Use `ctx.format(...)` to recurse.
- Prefer new formatters over editing old ones.
- Prefer extenders that own a spec module: keep spec-specific logic out of core.

---

## Extending preview UX (commands + webview actions)

### Goal

Add a new user-triggered action such as:

- A new command
- A new webview click action
- A new context menu item

### Choose the right extension point

- **VS Code command** → a preview extender registering `system.registerCommand(...)`.
- **Webview action** → a preview extender registering `system.registerMessageHandler(...)` and a webview UI change that posts the message.

### Steps: adding a command

1) Create a new folder:

- `src/preview/extenders/<yourCommand>/`

2) Create `extender.ts`:

- Export `previewExtender`
- Call `system.registerCommand(...)`

3) Add the command to `package.json` `contributes.commands` if it’s user-visible.

4) Add unit tests:

- Extend `src/test/unit/extension.unit.test.ts` or add a new unit test file.

### Steps: adding a webview message action

1) Add a message handler extender under `src/preview/extenders/...`.

2) Update the webview script (in `media/cborViewerWebview.js`) to post a message with a unique `type`.

3) Ensure the handler validates inputs and uses `ctx.memFs` / `ctx.blobs` only.

4) Add unit tests:

- Prefer tests that call `PreviewSystem.handleWebviewMessage(...)` directly with a VS Code mock.

---

## Adding a new built-in extender folder safely

Both extender loaders scan their extender root folders at runtime:

- Pretty: `src/pretty/extenders/*/extender`
- Preview: `src/preview/extenders/*/extender`

Requirements:

- The file must be named `extender.ts`.
- It must export `prettyExtender` or `previewExtender`.
- The exported object must have:
  - `id: string`
  - `register(...)` function

---

## Testing + coverage expectations

This repo enforces a strict line coverage threshold.

Run:

- `npm run test:unit` for fast feedback
- `npm run test:coverage` for the gate (must pass)

When you add a new extender:

- Add tests that import and execute it directly.
- Cover both success and validation/early-return paths.
- If you add a loader branch or error path, add a unit test that exercises it (often by creating a temporary folder/file during the test).
