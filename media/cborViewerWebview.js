(function () {
  const pre = document.getElementById('json-content');
  if (!pre) {
    return;
  }

  const statusBanner = document.getElementById('webview-status');
  const errorBanner = document.getElementById('webview-error');

  function setStatus(text, hide) {
    try {
      if (!statusBanner) return;
      statusBanner.textContent = String(text);
      statusBanner.style.display = hide ? 'none' : 'block';
    } catch {
      // ignore
    }
  }

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

  const dataset = (document.body && document.body.dataset) ? document.body.dataset : {};
  let viewMode = dataset.viewMode === 'raw' ? 'raw' : 'pretty';
  const TOKEN = String(dataset.hexToken || '___CBOR_HEX_LINK___');
  const PAYLOAD_TOKEN = String(dataset.payloadToken || '___CBOR_PAYLOAD_PREVIEW___');

  let vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {
    showBanner('CBOR Viewer: failed to acquire VS Code webview API (acquireVsCodeApi). Scripts may be blocked by CSP or webview initialization failed.', e);
    setStatus('CBOR Viewer: webview failed to initialize (no VS Code API).', false);
    return;
  }

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
    try {
      showWebviewError('CBOR Viewer webview error', e && (e.error || e.message));
    } catch {
      // ignore
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    try {
      showWebviewError('CBOR Viewer webview unhandled rejection', e && (e.reason || e));
    } catch {
      // ignore
    }
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

          const hexIdx = withoutQuotes.indexOf(TOKEN);
          const payloadIdx = withoutQuotes.indexOf(PAYLOAD_TOKEN);

          if (hexIdx >= 0) {
            const payload = withoutQuotes.slice(hexIdx + TOKEN.length).trimStart();
            const bar = payload.indexOf('|');
            if (bar > 0) {
              const blobId = payload.slice(0, bar).trim();
              const preview = payload.slice(bar + 1);
              out += '<a class="hex-preview-link" href="#" data-blobid="' + escapeHtmlAttr(blobId) + '">' +
                '"' + escapeHtmlToken(preview) + '"' +
                '</a>';
              continue;
            }
          }

          if (payloadIdx >= 0) {
            const payload = withoutQuotes.slice(payloadIdx + PAYLOAD_TOKEN.length).trimStart();
            const bar = payload.indexOf('|');
            if (bar > 0) {
              const blobId = payload.slice(0, bar).trim();
              const preview = payload.slice(bar + 1);
              const maxChars = 120;
              const displayPreview = preview.length > maxChars ? (preview.slice(0, maxChars) + '...') : preview;
              out += '<a class="payload-preview-link" href="#" data-blobid="' + escapeHtmlAttr(blobId) + '" title="' +
                escapeHtmlAttr(preview) +
                '">' +
                '"' + escapeHtmlToken(displayPreview) + '"' +
                '</a>';
              continue;
            }
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
      const linkCount = pre.querySelectorAll('a.hex-preview-link, a.payload-preview-link').length;
      if (txt.indexOf(TOKEN) >= 0 || txt.indexOf(PAYLOAD_TOKEN) >= 0) {
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

  // Accept messages only from trusted origins
  // Change this list based on your trusted environment. 
  // VS Code webviews can use 'vscode-webview://<uuid>' or set to '*' only if absolutely safe.
  const TRUSTED_ORIGINS = [
    'vscode-webview://', // Use your actual webview origin base, or set exact strings if possible
  ];

  window.addEventListener('message', (event) => {
    // Check whether the message comes from a trusted origin
    if (!event.origin || !TRUSTED_ORIGINS.some(trusted => event.origin.startsWith(trusted))) {
      // Optionally uncomment the next line to log unexpected origins for debugging:
      // console.warn('[CBOR Viewer] Ignored message from untrusted origin:', event.origin);
      return;
    }
    const msg = event && event.data;
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
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;
    const link = target.closest ? target.closest('a.hex-preview-link') : null;
    if (!link) return;
    const blobId = link.getAttribute('data-blobid');
    if (!blobId) return;
    e.preventDefault();
    vscode.postMessage({ type: 'openHexBlob', blobId: blobId });
  });

  pre.addEventListener('click', function (e) {
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;
    const link = target.closest ? target.closest('a.payload-preview-link') : null;
    if (!link) return;
    const blobId = link.getAttribute('data-blobid');
    if (!blobId) return;
    e.preventDefault();
    vscode.postMessage({ type: 'openTextBlob', blobId: blobId });
  });

  pre.addEventListener('contextmenu', function (e) {
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;
    const link = target.closest ? target.closest('a.hex-preview-link') : null;
    if (!link) return;
    const blobId = link.getAttribute('data-blobid');
    if (!blobId) return;

    e.preventDefault();
    const menu = document.getElementById('context-menu');
    if (!menu) {
      vscode.postMessage({ type: 'openHexBlob', blobId: blobId });
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

    addItem('Open in Hex Editor', { type: 'openHexBlob', blobId: blobId });
    addItem('Decode as CBOR', { type: 'decodeAsCbor', kind: 'blobId', blobId: blobId });
    addItem(viewMode === 'raw' ? 'View Pretty CBOR' : 'View Raw CBOR', { type: 'setViewMode', mode: viewMode === 'raw' ? 'pretty' : 'raw' });

    menu.style.left = String(e.pageX) + 'px';
    menu.style.top = String(e.pageY) + 'px';
    menu.style.display = 'block';
  });

  pre.addEventListener('contextmenu', function (e) {
    const target = e.target;
    if (!target || !(target instanceof HTMLElement)) return;
    const link = target.closest ? target.closest('a.payload-preview-link') : null;
    if (!link) return;
    const blobId = link.getAttribute('data-blobid');
    if (!blobId) return;

    e.preventDefault();
    const menu = document.getElementById('context-menu');
    if (!menu) {
      vscode.postMessage({ type: 'openTextBlob', blobId: blobId });
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

    addItem('Open as Text', { type: 'openTextBlob', blobId: blobId });
    addItem('Open in Hex Editor', { type: 'openHexBlob', blobId: blobId });
    addItem('Decode as CBOR', { type: 'decodeAsCbor', kind: 'blobId', blobId: blobId });
    addItem(viewMode === 'raw' ? 'View Pretty CBOR' : 'View Raw CBOR', { type: 'setViewMode', mode: viewMode === 'raw' ? 'pretty' : 'raw' });

    menu.style.left = String(e.pageX) + 'px';
    menu.style.top = String(e.pageY) + 'px';
    menu.style.display = 'block';
  });

  const menu = document.getElementById('context-menu');
  function hideMenu() {
    if (menu) menu.style.display = 'none';
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
    const target = e && e.target;
    if (!target || !(target instanceof HTMLElement)) return '';
    const stringEl = target.closest ? target.closest('span.json-string') : null;
    if (stringEl && typeof stringEl.textContent === 'string') {
      return stringEl.textContent.trim();
    }
    return '';
  }

  pre.addEventListener('contextmenu', function (e) {
    if (e.defaultPrevented) {
      return;
    }

    const selected = getSelectionText() || getTokenUnderCursor(e);
    const items = [];

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
        }
      } else if (isByteArray(parsed) && parsed.length <= 4096) {
        items.push({
          label: 'Decode as CBOR',
          message: { type: 'decodeAsCbor', kind: 'byteArray', bytes: parsed }
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
    }

    if (items.length === 0 && looksLikeBase64(selected)) {
      items.push({
        label: 'Decode as CBOR',
        message: { type: 'decodeAsCbor', kind: 'stringBase64', value: stripQuotes(selected) }
      });
    }

    if (items.length === 0 && looksLikeHex(selected)) {
      items.push({
        label: 'Decode as CBOR',
        message: { type: 'decodeAsCbor', kind: 'hex', hex: stripQuotes(selected) }
      });
    }

    items.unshift({
      label: viewMode === 'raw' ? 'View Pretty CBOR' : 'View Raw CBOR',
      message: { type: 'setViewMode', mode: viewMode === 'raw' ? 'pretty' : 'raw' }
    });

    if (items.length === 0) {
      return;
    }

    e.preventDefault();
    showMenu(e.pageX, e.pageY, items);
  });

  document.addEventListener('click', function () { hideMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideMenu(); });
})();
