/**
 * @fileoverview CBOR Viewer webview script.
 *
 * The webview is a UI surface only. It does not decode CBOR itself.
 * Instead it:
 * - syntax-highlights the JSON payload embedded in the HTML
 * - linkifies tokenized preview hints (hex/text previews)
 * - provides a context menu for actions (open hex/text, decode as CBOR, decode as COSE headers, ...)
 * - posts messages back to the extension host which performs the privileged work
 *
 * Key design principles:
 * - Be resilient: failures should degrade gracefully (show a banner; never hard-crash the UI).
 * - Treat all incoming data as untrusted: validate shapes and default conservatively.
 * - Keep state small: the source of truth lives in the extension host.
 */

(function () {
  const pre = document.getElementById('json-content');
  if (!pre) {
    return;
  }

  const statusBanner = document.getElementById('webview-status');
  const errorBanner = document.getElementById('webview-error');

  /**
   * Set/hide the top status banner.
   *
   * This banner is intentionally low-friction: it helps diagnose CSP issues or broken message
   * wiring without spamming the extension host.
   */
  function setStatus(text, hide) {
    try {
      if (!statusBanner) return;
      statusBanner.textContent = String(text);
      statusBanner.style.display = hide ? 'none' : 'block';
    } catch {
      // ignore
    }
  }

  /** Show a persistent error banner with optional stack details. */
  function showBanner(message, err) {
    try {
      if (!errorBanner) return;
      const details = err && err.stack ? String(err.stack) : (err ? String(err) : '');
      errorBanner.textContent = details ? String(message) + "\n" + details : String(message);
      errorBanner.style.display = 'block';
    } catch {
      // ignore
    }
  }

  // Configuration is passed from the extension host via `data-*` attributes on <body>.
  // This keeps the script generic and makes it easier to unit test and evolve.
  const dataset = (document.body && document.body.dataset) ? document.body.dataset : {};
  let viewMode = dataset.viewMode === 'raw' ? 'raw' : 'pretty';
  const TOKEN = String(dataset.hexToken || '___CBOR_HEX_LINK___');
  const PAYLOAD_TOKEN = String(dataset.payloadToken || '___CBOR_PAYLOAD_PREVIEW___');
  let previewHintKinds = [];
  try {
    if (typeof dataset.previewHintKinds === 'string' && dataset.previewHintKinds.trim()) {
      const parsed = JSON.parse(dataset.previewHintKinds);
      if (Array.isArray(parsed)) {
        previewHintKinds = parsed;
      }
    }
  } catch {
    // ignore
  }
  // Backward-compatible default config.
  if (!Array.isArray(previewHintKinds) || previewHintKinds.length === 0) {
    previewHintKinds = [
      {
        kind: 'hex',
        token: TOKEN,
        cssClass: 'hex-preview-link',
        onClickMessage: { type: 'openHexBlob', blobId: '$blobId' },
        contextMenuItems: [
          { label: 'Open in Hex Editor', message: { type: 'openHexBlob', blobId: '$blobId' } },
          { label: 'Decode as CBOR', message: { type: 'decodeAsCbor', kind: 'blobId', blobId: '$blobId' } },
          { label: 'Decode as COSE Headers', message: { type: 'decodeAsCoseHeaders', kind: 'blobId', blobId: '$blobId' } }
        ]
      },
      {
        kind: 'text',
        token: PAYLOAD_TOKEN,
        cssClass: 'payload-preview-link',
        onClickMessage: { type: 'openTextBlob', blobId: '$blobId' },
        contextMenuItems: [
          { label: 'Open as Text', message: { type: 'openTextBlob', blobId: '$blobId' } },
          { label: 'Open in Hex Editor', message: { type: 'openHexBlob', blobId: '$blobId' } },
          { label: 'Decode as CBOR', message: { type: 'decodeAsCbor', kind: 'blobId', blobId: '$blobId' } },
          { label: 'Decode as COSE Headers', message: { type: 'decodeAsCoseHeaders', kind: 'blobId', blobId: '$blobId' } }
        ],
        truncateChars: 120,
        titleIsFullValue: true
      }
    ];
  }

  /**
   * Normalize hint configs into:
   * - `byKind`: fast lookup for context menu
   * - `byToken`: ordered list for scanning token strings during highlight
   */
  function mapPreviewHintKinds(list) {
    const byKind = Object.create(null);
    const byToken = [];
    for (let i = 0; i < list.length; i++) {
      const k = list[i];
      if (!k || typeof k.kind !== 'string' || typeof k.token !== 'string' || typeof k.cssClass !== 'string') continue;
      if (!byKind[k.kind]) {
        byKind[k.kind] = k;
      }
      byToken.push(k);
    }
    return { byKind, byToken };
  }

  const previewKinds = mapPreviewHintKinds(previewHintKinds);

  /**
   * Replace "$blobId" placeholders in a message template.
   *
   * Preview hint kinds define message templates that are data-only objects.
   * We fill in the blob id on demand so the config can be shared across links.
   */
  function applyPlaceholders(obj, blobId) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      return obj === '$blobId' ? String(blobId || '') : obj;
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map((v) => applyPlaceholders(v, blobId));
    }
    const out = {};
    for (const key of Object.keys(obj)) {
      out[key] = applyPlaceholders(obj[key], blobId);
    }
    return out;
  }

  let vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {
    showBanner('CBOR Viewer: failed to acquire VS Code webview API (acquireVsCodeApi). Scripts may be blocked by CSP or webview initialization failed.', e);
    setStatus('CBOR Viewer: webview failed to initialize (no VS Code API).', false);
    return;
  }

  /** Best-effort logging back to the extension host. */
  function postLog(level, message, details) {
    try {
      vscode.postMessage({
        type: 'webviewLog',
        level: String(level || 'info'),
        message: String(message || ''),
        details: details === undefined ? undefined : String(details)
      });
    } catch {
      // ignore
    }
  }

  /**
   * Report an error to both the webview banner (for user visibility) and the extension host log
   * (for debugging via DevTools / extension output).
   */
  function showWebviewError(message, err) {
    try {
      showBanner(message, err);
    } catch {
      // ignore
    }

    try {
      vscode.postMessage({
        type: 'webviewLog',
        level: 'error',
        message: String(message),
        details: err && err.stack ? String(err.stack) : (err ? String(err) : undefined)
      });
    } catch {
      // ignore
    }
  }

  window.addEventListener('error', (e) => {
        showWebviewError('CBOR Viewer webview error', e && (e.error || e.message));
  });

  window.addEventListener('unhandledrejection', (e) => {
        showWebviewError('CBOR Viewer webview unhandled rejection', e && (e.reason || e));
  });

  setStatus('CBOR Viewer: webview running', true);
  postLog('info', 'CBOR Viewer webview script started', 'viewMode=' + String(viewMode));
  postLog('info', 'CBOR Viewer tokens', 'TOKEN=' + TOKEN + ' PAYLOAD_TOKEN=' + PAYLOAD_TOKEN);

  function escapeHtmlToken(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtmlAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isWordChar(ch) {
    return /[A-Za-z0-9_]/.test(ch);
  }

  /**
   * Minimal JSON "highlighter" that also performs linkification.
   *
   * We do *not* parse JSON here. We treat the preformatted JSON text as the canonical display
   * (already produced by the extension host) and inject spans/anchors purely as markup.
   *
   * Why not parse JSON:
   * - parsing would allocate another object graph for potentially large payloads
   * - preserving original formatting (indentation/newlines) becomes harder
   * - errors become harder to explain to users
   */
  function highlightJson(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
      const ch = text[i];

      if (ch === '"') {
        const start = i;
        i++;
        let escaped = false;
        while (i < text.length) {
          const c = text[i];
          if (escaped) {
            escaped = false;
            i++;
            continue;
          }
          if (c === '\\') {
            escaped = true;
            i++;
            continue;
          }
          if (c === '"') {
            i++;
            break;
          }
          i++;
        }

        const token = text.slice(start, i);
        let j = i;
        while (j < text.length && /\s/.test(text[j])) j++;
        const isKey = text[j] === ':';

        if (!isKey) {
          const withoutQuotes = token.length >= 2 && token[0] === '"' && token[token.length - 1] === '"'
            ? token.slice(1, -1)
            : token;

          let replaced = false;
          for (let k = 0; k < previewKinds.byToken.length; k++) {
            const cfg = previewKinds.byToken[k];
            if (!cfg || typeof cfg.token !== 'string') continue;
            const idx = withoutQuotes.indexOf(cfg.token);
            if (idx < 0) continue;

            const payload = withoutQuotes.slice(idx + String(cfg.token).length).trimStart();
            const bar = payload.indexOf('|');
            if (bar > 0) {
              const blobId = payload.slice(0, bar).trim();
              const preview = payload.slice(bar + 1);
              const truncate = typeof cfg.truncateChars === 'number' ? cfg.truncateChars : undefined;
              const displayPreview = truncate && preview.length > truncate ? (preview.slice(0, truncate) + '...') : preview;
              const titleAttr = cfg.titleIsFullValue ? (' title="' + escapeHtmlAttr(preview) + '"') : '';
              out += '<a class="' + escapeHtmlAttr(cfg.cssClass) + '" href="#" data-preview-kind="' + escapeHtmlAttr(cfg.kind) + '" data-blobid="' + escapeHtmlAttr(blobId) + '"' + titleAttr + '>' +
                '"' + escapeHtmlToken(displayPreview) + '"' +
                '</a>';
              replaced = true;
              break;
            }
          }

          if (replaced) {
            continue;
          }
        }

        const cls = isKey ? 'json-key' : 'json-string';
        out += '<span class="' + cls + '">' + escapeHtmlToken(token) + '</span>';
        continue;
      }

      if (ch === '-' || (ch >= '0' && ch <= '9')) {
        const m = text.slice(i).match(/^-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/);
        if (m && m[0]) {
          out += '<span class="json-number">' + escapeHtmlToken(m[0]) + '</span>';
          i += m[0].length;
          continue;
        }
      }

      if (text.startsWith('true', i) && !isWordChar(text[i + 4] || '')) {
        out += '<span class="json-boolean">true</span>';
        i += 4;
        continue;
      }
      if (text.startsWith('false', i) && !isWordChar(text[i + 5] || '')) {
        out += '<span class="json-boolean">false</span>';
        i += 5;
        continue;
      }
      if (text.startsWith('null', i) && !isWordChar(text[i + 4] || '')) {
        out += '<span class="json-null">null</span>';
        i += 4;
        continue;
      }

      out += escapeHtmlToken(ch);
      i++;
    }

    return out;
  }

  function renderFromText(raw) {
    try {
      pre.innerHTML = highlightJson(raw);
      const txt = pre.textContent || '';
      const linkCount = pre.querySelectorAll('a[data-preview-kind][data-blobid]').length;
      let tokensVisible = false;
      for (let i = 0; i < previewKinds.byToken.length; i++) {
        const cfg = previewKinds.byToken[i];
        if (cfg && typeof cfg.token === 'string' && txt.indexOf(cfg.token) >= 0) {
          tokensVisible = true;
          break;
        }
      }
      if (tokensVisible) {
        showWebviewError('CBOR Viewer: rendering/linkification failed (link tokens still visible).', undefined);
        postLog('warn', 'CBOR Viewer render produced visible tokens', 'links=' + String(linkCount));
      } else {
        postLog('info', 'CBOR Viewer rendered OK', 'viewMode=' + String(viewMode) + ' links=' + String(linkCount));
      }
    } catch (e) {
      pre.textContent = raw || '';
      showWebviewError('CBOR Viewer: render failed', e);
    }
  }

  renderFromText(pre.textContent || '');
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ping') {
      try {
        vscode.postMessage({ type: 'pong', t: msg.t });
      } catch {
        // ignore
      }
      postLog('info', 'CBOR Viewer webview received ping', 't=' + String(msg.t || ''));
      return;
    }

    if (msg.type === 'setJson' && typeof msg.json === 'string') {
      if (msg.viewMode === 'pretty' || msg.viewMode === 'raw') {
        viewMode = msg.viewMode;
      }
      pre.textContent = msg.json;
      renderFromText(msg.json);
    }
  });

  pre.addEventListener('click', function (e) {
    function getEventElement(ev) {
      const t = ev && ev.target;
      if (t && t instanceof HTMLElement) return t;
      if (t && t.nodeType === 3 && t.parentElement) return t.parentElement;
      try {
        if (ev && typeof ev.composedPath === 'function') {
          const path = ev.composedPath();
          for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (p && p instanceof HTMLElement) return p;
          }
        }
      } catch {
        // ignore
      }
      return null;
    }

    function elementAtPointer(ev) {
      try {
        if (!document || typeof document.elementFromPoint !== 'function') return null;
        const x = ev && typeof ev.clientX === 'number' ? ev.clientX : null;
        const y = ev && typeof ev.clientY === 'number' ? ev.clientY : null;
        if (x === null || y === null) return null;
        const el = document.elementFromPoint(x, y);
        return el && el instanceof HTMLElement ? el : null;
      } catch {
        return null;
      }
    }

    const target = getEventElement(e) || elementAtPointer(e);
    if (!target) return;
    const link = target.closest ? target.closest('a[data-preview-kind][data-blobid]') : null;
    if (!link) return;
    const kind = link.getAttribute('data-preview-kind');
    const blobId = link.getAttribute('data-blobid');
    if (!kind || !blobId) return;
    const cfg = previewKinds.byKind[kind];
    if (!cfg || !cfg.onClickMessage) return;
    e.preventDefault();
    vscode.postMessage(applyPlaceholders(cfg.onClickMessage, blobId));
  });

  pre.addEventListener('contextmenu', function (e) {
    function getEventElement(ev) {
      const t = ev && ev.target;
      if (t && t instanceof HTMLElement) return t;
      if (t && t.nodeType === 3 && t.parentElement) return t.parentElement;
      try {
        if (ev && typeof ev.composedPath === 'function') {
          const path = ev.composedPath();
          for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (p && p instanceof HTMLElement) return p;
          }
        }
      } catch {
        // ignore
      }
      return null;
    }

    function elementAtPointer(ev) {
      try {
        if (!document || typeof document.elementFromPoint !== 'function') return null;
        const x = ev && typeof ev.clientX === 'number' ? ev.clientX : null;
        const y = ev && typeof ev.clientY === 'number' ? ev.clientY : null;
        if (x === null || y === null) return null;
        const el = document.elementFromPoint(x, y);
        return el && el instanceof HTMLElement ? el : null;
      } catch {
        return null;
      }
    }

    const target = getEventElement(e) || elementAtPointer(e);
    if (!target) return;
    const link = target.closest ? target.closest('a[data-preview-kind][data-blobid]') : null;
    if (!link) return;
    const kind = link.getAttribute('data-preview-kind');
    const blobId = link.getAttribute('data-blobid');
    if (!kind || !blobId) return;
    const cfg = previewKinds.byKind[kind];
    if (!cfg) return;

    e.preventDefault();
    const menu = document.getElementById('context-menu');
    if (!menu) {
      if (cfg.onClickMessage) {
        vscode.postMessage(applyPlaceholders(cfg.onClickMessage, blobId));
      }
      return;
    }

    menu.innerHTML = '';
    function addItem(label, message) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        menu.style.display = 'none';
        vscode.postMessage(message);
      });
      menu.appendChild(btn);
    }

    addItem(viewMode === 'raw' ? 'View Pretty CBOR' : 'View Raw CBOR', { type: 'setViewMode', mode: viewMode === 'raw' ? 'pretty' : 'raw' });
    const items = Array.isArray(cfg.contextMenuItems) ? cfg.contextMenuItems : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it.label !== 'string' || !it.message) continue;
      addItem(it.label, applyPlaceholders(it.message, blobId));
    }

    const pos = getMenuCoords(e);
    menu.style.left = String(pos.x) + 'px';
    menu.style.top = String(pos.y) + 'px';
    menu.style.display = 'block';
  });

  const menu = document.getElementById('context-menu');
  function hideMenu() {
    if (menu) menu.style.display = 'none';
  }

  function getMenuCoords(e) {
    // Menu is styled with `position: fixed` (viewport coords).
    // Use clientX/clientY to avoid scroll offsets.
    const x = (e && typeof e.clientX === 'number') ? e.clientX : ((e && typeof e.pageX === 'number') ? e.pageX : 0);
    const y = (e && typeof e.clientY === 'number') ? e.clientY : ((e && typeof e.pageY === 'number') ? e.pageY : 0);
    return { x, y };
  }

  function showMenu(x, y, items) {
    if (!menu) return;
    menu.innerHTML = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        hideMenu();
        vscode.postMessage(item.message);
      });
      menu.appendChild(btn);
    }
    menu.style.left = String(x) + 'px';
    menu.style.top = String(y) + 'px';
    menu.style.display = 'block';
  }

  function stripQuotes(s) {
    const t = String(s || '').trim();
    if (t.length >= 2) {
      const first = t[0];
      const last = t[t.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return t.slice(1, -1);
      }
    }
    return t;
  }

  function looksLikeHex(s) {
    const t = stripQuotes(s).trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (t.length < 2) return false;
    if (t.length % 2 !== 0) return false;
    return /^[0-9a-fA-F]+$/.test(t);
  }

  function looksLikeBase64(s) {
    const t = stripQuotes(s).trim();
    if (t.length < 8) return false;
    if (t.indexOf(' ') >= 0 || t.indexOf('{') >= 0 || t.indexOf('[') >= 0) return false;
    return /^[A-Za-z0-9+/_\-]+=*$/.test(t);
  }

  function tryParseJson(s) {
    const t = String(s || '').trim();
    if (!t) return undefined;
    if (t[0] !== '[' && t[0] !== '{') return undefined;
    try {
      return JSON.parse(t);
    } catch {
      return undefined;
    }
  }

  function isByteArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255) return false;
    }
    return true;
  }

  function getSelectionText() {
    const sel = (window.getSelection && window.getSelection()) ? (window.getSelection().toString() || '') : '';
    return String(sel || '').trim();
  }

  function getTokenUnderCursor(e) {
    function getEventElement(ev) {
      const t = ev && ev.target;
      if (t && t instanceof HTMLElement) return t;
      if (t && t.nodeType === 3 && t.parentElement) return t.parentElement;
      try {
        if (ev && typeof ev.composedPath === 'function') {
          const path = ev.composedPath();
          for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (p && p instanceof HTMLElement) return p;
          }
        }
      } catch {
        // ignore
      }
      return null;
    }

    function getStringTokenFromElement(el) {
      if (!el || !(el instanceof HTMLElement)) return '';
      const stringEl = el.closest ? el.closest('span.json-string') : null;
      if (stringEl && typeof stringEl.textContent === 'string') {
        return stringEl.textContent.trim();
      }
      return '';
    }

    const target = getEventElement(e);
    const direct = getStringTokenFromElement(target);
    if (direct) return direct;

    // Fallback: use pointer coordinates (more reliable when the event target is the <pre>).
    try {
      if (!document || typeof document.elementFromPoint !== 'function') return '';
      const x = e && typeof e.clientX === 'number' ? e.clientX : null;
      const y = e && typeof e.clientY === 'number' ? e.clientY : null;
      if (x === null || y === null) return '';
      const at = document.elementFromPoint(x, y);
      return getStringTokenFromElement(at);
    } catch {
      return '';
    }
  }

  pre.addEventListener('contextmenu', function (e) {
    if (e.defaultPrevented) {
      return;
    }

    const selectedText = getSelectionText();
    const tokenText = selectedText ? '' : getTokenUnderCursor(e);
    const selected = selectedText || tokenText;
    const items = [];
    const hadSpecificAction = !!(selected && String(selected).trim().length > 0);

    const parsed = tryParseJson(selected);
    if (parsed && typeof parsed === 'object') {
      if (parsed._type === 'bytes') {
        if (typeof parsed._hexBlobId === 'string') {
          items.push({
            label: 'Open in Hex Editor',
            message: { type: 'openHexBlob', blobId: parsed._hexBlobId }
          });
          items.push({
            label: 'Decode as CBOR',
            message: { type: 'decodeAsCbor', kind: 'blobId', blobId: parsed._hexBlobId }
          });
          items.push({
            label: 'Decode as COSE Headers',
            message: { type: 'decodeAsCoseHeaders', kind: 'blobId', blobId: parsed._hexBlobId }
          });
        }
      } else if (isByteArray(parsed) && parsed.length <= 4096) {
        items.push({
          label: 'Decode as CBOR',
          message: { type: 'decodeAsCbor', kind: 'byteArray', bytes: parsed }
        });
        items.push({
          label: 'Decode as COSE Headers',
          message: { type: 'decodeAsCoseHeaders', kind: 'byteArray', bytes: parsed }
        });
      }
    }

    const stripped = stripQuotes(selected);
    if (items.length === 0 && /^blob-\d+$/.test(stripped)) {
      items.push({
        label: 'Open in Hex Editor',
        message: { type: 'openHexBlob', blobId: stripped }
      });
      items.push({
        label: 'Decode as CBOR',
        message: { type: 'decodeAsCbor', kind: 'blobId', blobId: stripped }
      });
      items.push({
        label: 'Decode as COSE Headers',
        message: { type: 'decodeAsCoseHeaders', kind: 'blobId', blobId: stripped }
      });
    }

    if (items.length === 0 && looksLikeBase64(selected)) {
      items.push({
        label: 'Decode as CBOR',
        message: { type: 'decodeAsCbor', kind: 'stringBase64', value: stripQuotes(selected) }
      });
      items.push({
        label: 'Decode as COSE Headers',
        message: { type: 'decodeAsCoseHeaders', kind: 'stringBase64', value: stripQuotes(selected) }
      });
    }

    if (items.length === 0 && looksLikeHex(selected)) {
      items.push({
        label: 'Decode as CBOR',
        message: { type: 'decodeAsCbor', kind: 'hex', hex: stripQuotes(selected) }
      });
      items.push({
        label: 'Decode as COSE Headers',
        message: { type: 'decodeAsCoseHeaders', kind: 'hex', hex: stripQuotes(selected) }
      });
    }

    // If there wasn't a specific selection/token-based action, but the document is a COSE_Sign1
    // raw structure (tag 18 wrapping a 4-item array), offer explicit header-part decode actions.
    if (items.length === 0 && !hadSpecificAction) {
      const full = tryParseJson(pre.textContent || '');
      if (full && typeof full === 'object' && full._cborTag === 18 && Array.isArray(full.value) && full.value.length >= 2) {
        items.push({
          label: 'Decode COSE Protected Headers',
          message: { type: 'decodeCoseHeadersPart', part: 'protected' }
        });
        items.push({
          label: 'Decode COSE Unprotected Headers',
          message: { type: 'decodeCoseHeadersPart', part: 'unprotected' }
        });
      }
    }

    items.unshift({
      label: viewMode === 'raw' ? 'View Pretty CBOR' : 'View Raw CBOR',
      message: { type: 'setViewMode', mode: viewMode === 'raw' ? 'pretty' : 'raw' }
    });

    e.preventDefault();
    const pos = getMenuCoords(e);
    showMenu(pos.x, pos.y, items);
  });

  document.addEventListener('click', function () { hideMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideMenu(); });
})();
