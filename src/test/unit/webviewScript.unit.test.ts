import * as assert from 'assert';
import { JSDOM } from 'jsdom';

suite('Unit: webview script (media/cborViewerWebview.js)', () => {
    function setupDom(initialJson: string, viewMode: 'pretty' | 'raw' = 'pretty') {
        const dom = new JSDOM(`<!doctype html>
<html><body
  data-view-mode="${viewMode}"
  data-hex-token="___CBOR_HEX_LINK___"
  data-payload-token="___CBOR_PAYLOAD_PREVIEW___"
>
  <div id="webview-status"></div>
  <div id="webview-error"></div>
  <pre id="json-content">${initialJson.replace(/</g, '&lt;')}</pre>
  <div id="context-menu"></div>
</body></html>`, { url: 'https://example.test' });

        const posted: any[] = [];
        (dom.window as any).acquireVsCodeApi = () => ({
            postMessage: (m: any) => posted.push(m)
        });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(scriptPath);

        return { dom, posted };
    }

    test('tokenized strings become anchors and clicks post messages', async () => {
        const { dom, posted } = setupDom(`{
  "hex": "___CBOR_HEX_LINK___ blob-1|0102...",
  "payload": "___CBOR_PAYLOAD_PREVIEW___ blob-2|hello world"
}`);

        const pre = dom.window.document.getElementById('json-content')!;
        assert.ok(pre.innerHTML.includes('hex-preview-link'));
        assert.ok(pre.innerHTML.includes('payload-preview-link'));
        assert.ok(!pre.textContent!.includes('___CBOR_HEX_LINK___'));
        assert.ok(!pre.textContent!.includes('___CBOR_PAYLOAD_PREVIEW___'));

        // Click hex link
        const hexLink = dom.window.document.querySelector('a.hex-preview-link') as any;
        assert.ok(hexLink);
        hexLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'openHexBlob' && m.blobId === 'blob-1'));

        // Click payload link
        const payloadLink = dom.window.document.querySelector('a.payload-preview-link') as any;
        assert.ok(payloadLink);
        payloadLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'openTextBlob' && m.blobId === 'blob-2'));

        // Ping message -> pong
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'ping', t: 123 } }));
        assert.ok(posted.some(m => m.type === 'pong' && m.t === 123));
    });

      test('context menu on hex link offers actions and posts correct messages', async () => {
        const { dom, posted } = setupDom(`{
      "hex": "___CBOR_HEX_LINK___ blob-9|0102..."
    }`);

        const link = dom.window.document.querySelector('a.hex-preview-link') as any;
        assert.ok(link);

        // Right-click on link should open menu.
        link.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 10, pageY: 20 } as any));

        const menu = dom.window.document.getElementById('context-menu')!;
        assert.strictEqual(menu.style.display, 'block');
        const buttons = Array.from(menu.querySelectorAll('button')).map(b => (b as any).textContent);
        assert.ok(buttons.includes('Open in Hex Editor'));
        assert.ok(buttons.includes('Decode as CBOR'));

        // Click Decode as CBOR
        const decodeBtn = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Decode as CBOR') as any;
        decodeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'decodeAsCbor' && m.kind === 'blobId' && m.blobId === 'blob-9'));
      });

      test('context menu on payload link posts open/decode and view toggle', async () => {
        const { dom, posted } = setupDom(`{
      "payload": "___CBOR_PAYLOAD_PREVIEW___ blob-2|hello world"
    }`, 'raw');

        const link = dom.window.document.querySelector('a.payload-preview-link') as any;
        assert.ok(link);
        link.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 1, pageY: 2 } as any));

        const menu = dom.window.document.getElementById('context-menu')!;
        const buttons = Array.from(menu.querySelectorAll('button')).map(b => (b as any).textContent);
        assert.ok(buttons.includes('Open as Text'));
        assert.ok(buttons.includes('Open in Hex Editor'));
        assert.ok(buttons.includes('Decode as CBOR'));
        assert.ok(buttons.includes('View Pretty CBOR'));

        const toggle = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'View Pretty CBOR') as any;
        toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'setViewMode' && m.mode === 'pretty'));
      });

      test('selection-based context menu posts decodeAsCbor for base64 and hex', async () => {
        const { dom, posted } = setupDom(`{
      "x": "AQID"
    }`);

          // Stub selection (must be >= 8 chars to match the heuristic)
          let selectionText = 'AQIDBAUG';
          (dom.window as any).getSelection = () => ({ toString: () => selectionText });
        const pre = dom.window.document.getElementById('json-content')!;
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 5, pageY: 6 } as any));

        let menu = dom.window.document.getElementById('context-menu')!;
        let decodeBtn = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Decode as CBOR') as any;
        assert.ok(decodeBtn);
        decodeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'decodeAsCbor' && m.kind === 'stringBase64'));

        posted.length = 0;
        // Include whitespace so it won't be treated as base64.
        selectionText = '01 02 03';
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 7, pageY: 8 } as any));

        menu = dom.window.document.getElementById('context-menu')!;
        decodeBtn = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Decode as CBOR') as any;
        assert.ok(decodeBtn);
        decodeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'decodeAsCbor' && m.kind === 'hex' && String(m.hex).includes('01 02 03')));
      });

      test('selection-based context menu decodes byte arrays and blob ids', async () => {
        const { dom, posted } = setupDom(`{
      "x": [1,2,3]
    }`);

        const pre = dom.window.document.getElementById('json-content')!;

        (dom.window as any).getSelection = () => ({ toString: () => '[1,2,3]' });
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 7, pageY: 8 } as any));

        let menu = dom.window.document.getElementById('context-menu')!;
        let decodeBtn = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Decode as CBOR') as any;
        assert.ok(decodeBtn);
        decodeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'decodeAsCbor' && m.kind === 'byteArray'));

        posted.length = 0;
        (dom.window as any).getSelection = () => ({ toString: () => '"blob-123"' });
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 7, pageY: 8 } as any));

        menu = dom.window.document.getElementById('context-menu')!;
        const openHex = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Open in Hex Editor') as any;
        assert.ok(openHex);
        openHex.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'openHexBlob' && m.blobId === 'blob-123'));

        posted.length = 0;
        const decode = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Decode as CBOR') as any;
        assert.ok(decode);
        decode.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'decodeAsCbor' && m.kind === 'blobId' && m.blobId === 'blob-123'));
      });

      test('does nothing if json <pre> is missing', async () => {
        const dom = new JSDOM(`<!doctype html><html><body>
          <div id="webview-status"></div>
          <div id="webview-error"></div>
          <div id="context-menu"></div>
        </body></html>`, { url: 'https://example.test' });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = () => ({ postMessage: () => {} });

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(scriptPath);
      });

      test('shows an error banner if VS Code API is unavailable', async () => {
        const dom = new JSDOM(`<!doctype html><html><body>
          <div id="webview-status"></div>
          <div id="webview-error"></div>
          <pre id="json-content">{"x":1}</pre>
          <div id="context-menu"></div>
        </body></html>`, { url: 'https://example.test' });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        // Do NOT provide acquireVsCodeApi
        (globalThis as any).acquireVsCodeApi = undefined;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(scriptPath);

        const err = dom.window.document.getElementById('webview-error')!;
        assert.strictEqual(err.style.display, 'block');
        assert.ok(String(err.textContent).includes('acquireVsCodeApi'));
      });

      test('setJson message updates viewMode and re-renders anchors', async () => {
        const { dom, posted } = setupDom(`{"x":"y"}`, 'pretty');
        posted.length = 0;

        dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
          data: {
            type: 'setJson',
            viewMode: 'raw',
            json: '{\n  "hex": "___CBOR_HEX_LINK___ blob-1|aa"\n}'
          }
        }));

        const pre = dom.window.document.getElementById('json-content')!;
        assert.ok(pre.innerHTML.includes('hex-preview-link'));

        // View mode toggle should now say View Pretty
        (dom.window as any).getSelection = () => ({ toString: () => '' });
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 1, pageY: 1 } as any));
        const menu = dom.window.document.getElementById('context-menu')!;
        const first = menu.querySelector('button') as any;
        assert.ok(first && String(first.textContent).includes('View Pretty'));
      });

      test('context menu falls back to direct message if menu element is missing', async () => {
        const dom = new JSDOM(`<!doctype html>
    <html><body
      data-view-mode="pretty"
      data-hex-token="___CBOR_HEX_LINK___"
      data-payload-token="___CBOR_PAYLOAD_PREVIEW___"
    >
      <div id="webview-status"></div>
      <div id="webview-error"></div>
      <pre id="json-content">{"hex":"___CBOR_HEX_LINK___ blob-1|0102"}</pre>
    </body></html>`, { url: 'https://example.test' });

        const posted: any[] = [];
        (dom.window as any).acquireVsCodeApi = () => ({ postMessage: (m: any) => posted.push(m) });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(scriptPath);

        const link = dom.window.document.querySelector('a.hex-preview-link') as any;
        link.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true } as any));
        assert.ok(posted.some(m => m.type === 'openHexBlob' && m.blobId === 'blob-1'));
      });

      test('getTokenUnderCursor supports blob-id context menu without selection', async () => {
        const { dom, posted } = setupDom(`{
      "id": "blob-12"
    }`);

        // Ensure selection is empty.
        (dom.window as any).getSelection = () => ({ toString: () => '' });

        const tokenSpan = dom.window.document.querySelector('span.json-string') as any;
        assert.ok(tokenSpan);
        tokenSpan.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 2, pageY: 3 } as any));

        const menu = dom.window.document.getElementById('context-menu')!;
        const openHex = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Open in Hex Editor') as any;
        assert.ok(openHex);
        openHex.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'openHexBlob' && m.blobId === 'blob-12'));
      });

      test('parsed bytes object selection offers blob actions', async () => {
        const { dom, posted } = setupDom(`{"x":1}`);
        (dom.window as any).getSelection = () => ({ toString: () => '{"_type":"bytes","_hexBlobId":"blob-7"}' });

        const pre = dom.window.document.getElementById('json-content')!;
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 1, pageY: 1 } as any));
        const menu = dom.window.document.getElementById('context-menu')!;
        const openHex = Array.from(menu.querySelectorAll('button')).find(b => (b as any).textContent === 'Open in Hex Editor') as any;
        assert.ok(openHex);
        openHex.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.ok(posted.some(m => m.type === 'openHexBlob' && m.blobId === 'blob-7'));
      });

      test('click and Escape hide the context menu', async () => {
        const { dom } = setupDom(`{"x":1}`);
        (dom.window as any).getSelection = () => ({ toString: () => '"blob-1"' });

        const pre = dom.window.document.getElementById('json-content')!;
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 1, pageY: 1 } as any));
        const menu = dom.window.document.getElementById('context-menu')!;
        assert.strictEqual(menu.style.display, 'block');

        dom.window.document.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.strictEqual(menu.style.display, 'none');

        // Show again then hit Escape
        pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 1, pageY: 1 } as any));
        assert.strictEqual(menu.style.display, 'block');
        dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.strictEqual(menu.style.display, 'none');
      });

      test('handles missing status/error banners without crashing', async () => {
        const dom = new JSDOM(`<!doctype html>
<html><body
  data-view-mode="pretty"
  data-hex-token="___CBOR_HEX_LINK___"
  data-payload-token="___CBOR_PAYLOAD_PREVIEW___"
>
  <pre id="json-content">{"x":true}</pre>
</body></html>`, { url: 'https://example.test' });

        const posted: any[] = [];
        (dom.window as any).acquireVsCodeApi = () => ({ postMessage: (m: any) => posted.push(m) });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require(scriptPath);

        assert.ok(posted.some(m => m.type === 'webviewLog'));
      });

      test('warns when link tokens remain visible after render', async () => {
        const { dom, posted } = setupDom(`{
  "___CBOR_HEX_LINK___": "not-a-value-link",
  "x": null,
  "n": -1.23e+4,
  "b": false
}`);

        const err = dom.window.document.getElementById('webview-error')!;
        assert.strictEqual(err.style.display, 'block');
        assert.ok(String(err.textContent).includes('linkification failed'));
        // Should emit both error + warn logs.
        assert.ok(posted.some(m => m.type === 'webviewLog' && m.level === 'error'));
        assert.ok(posted.some(m => m.type === 'webviewLog' && m.level === 'warn'));
      });

      test('render failure falls back to textContent and reports error', async () => {
        const { dom, posted } = setupDom('{"x":"y"}');
        posted.length = 0;

        const pre = dom.window.document.getElementById('json-content') as any;
        // Force renderFromText() to throw when setting innerHTML.
        Object.defineProperty(pre, 'innerHTML', {
          configurable: true,
          set() { throw new Error('boom'); }
        });

        dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
          data: { type: 'setJson', viewMode: 'pretty', json: '{"x":"z"}' }
        }));

        assert.ok(String(pre.textContent).includes('"x"'));
        assert.ok(posted.some(m => m.type === 'webviewLog' && m.level === 'error'));
      });

      test('error and unhandledrejection events are reported', async () => {
        const { dom, posted } = setupDom('{"x":1}');
        posted.length = 0;

        const errEvent = new (dom.window as any).ErrorEvent('error', {
          message: 'oops',
          error: new Error('oops')
        });
        dom.window.dispatchEvent(errEvent);

        const rejEvent = new dom.window.Event('unhandledrejection') as any;
        rejEvent.reason = new Error('nope');
        dom.window.dispatchEvent(rejEvent);

        assert.ok(posted.some(m => m.type === 'webviewLog' && m.level === 'error'));
      });

      test('click handlers ignore non-link clicks', async () => {
        const { dom, posted } = setupDom(`{"x":"y"}`);
        posted.length = 0;

        const pre = dom.window.document.getElementById('json-content')!;
        pre.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.strictEqual(posted.length, 0);
      });

      test('startup tolerates exceptions in banners and postMessage', async () => {
        const dom = new JSDOM(`<!doctype html>
<html><body
  data-view-mode="pretty"
  data-hex-token="___CBOR_HEX_LINK___"
  data-payload-token="___CBOR_PAYLOAD_PREVIEW___"
>
  <div id="webview-status"></div>
  <div id="webview-error"></div>
  <pre id="json-content">{"hex":"___CBOR_HEX_LINK___ blob-1|01\"02'..."}</pre>
  <div id="context-menu"></div>
</body></html>`, { url: 'https://example.test' });

        // Make banner setters throw so setStatus()/showBanner() hit their catch blocks.
        const status = dom.window.document.getElementById('webview-status') as any;
        Object.defineProperty(status, 'textContent', {
          configurable: true,
          set() { throw new Error('status boom'); }
        });

        const error = dom.window.document.getElementById('webview-error') as any;
        Object.defineProperty(error, 'textContent', {
          configurable: true,
          set() { throw new Error('error boom'); }
        });

        // Make postMessage throw so postLog() hits its catch block.
        (dom.window as any).acquireVsCodeApi = () => ({
          postMessage: () => { throw new Error('post boom'); }
        });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        assert.doesNotThrow(() => require(scriptPath));
      });

      test('acquireVsCodeApi failure still tolerates showBanner throwing (catch block)', async () => {
        const dom = new JSDOM(`<!doctype html>
<html><body>
  <div id="webview-status"></div>
  <div id="webview-error"></div>
  <pre id="json-content">{"x":1}</pre>
</body></html>`, { url: 'https://example.test' });

        const error = dom.window.document.getElementById('webview-error') as any;
        Object.defineProperty(error, 'textContent', {
          configurable: true,
          set() { throw new Error('banner boom'); }
        });

        (dom.window as any).acquireVsCodeApi = () => { throw new Error('no api'); };

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        assert.doesNotThrow(() => require(scriptPath));
      });

      test('showWebviewError tolerates showBanner+postMessage throwing (catch blocks)', async () => {
        const dom = new JSDOM(`<!doctype html>
<html><body>
  <div id="webview-status"></div>
  <div id="webview-error"></div>
  <pre id="json-content">{"x":1}</pre>
  <div id="context-menu"></div>
</body></html>`, { url: 'https://example.test' });

        const error = dom.window.document.getElementById('webview-error') as any;
        Object.defineProperty(error, 'textContent', {
          configurable: true,
          set() { throw new Error('banner boom'); }
        });

        (dom.window as any).acquireVsCodeApi = () => ({
          postMessage: () => { throw new Error('post boom'); }
        });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        require(scriptPath);

        // Trigger error handler which calls showWebviewError.
        const errEvent = new (dom.window as any).ErrorEvent('error', {
          message: 'boom',
          error: new Error('boom')
        });
        dom.window.dispatchEvent(errEvent);
      });

      test('non-HTMLElement event targets are ignored', async () => {
        const { dom, posted } = setupDom(`{
  "hex": "___CBOR_HEX_LINK___ blob-1|0102..."
}`);
        posted.length = 0;

        const pre = dom.window.document.getElementById('json-content')!;
        const textNode = dom.window.document.createTextNode('x');
        pre.appendChild(textNode);

        // Dispatch from a Text node => target is not HTMLElement.
        textNode.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        textNode.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true } as any));
        assert.strictEqual(posted.length, 0);
      });

      test('selection context menu with missing menu element does not throw', async () => {
        const dom = new JSDOM(`<!doctype html>
<html><body
  data-view-mode="pretty"
  data-hex-token="___CBOR_HEX_LINK___"
  data-payload-token="___CBOR_PAYLOAD_PREVIEW___"
>
  <div id="webview-status"></div>
  <div id="webview-error"></div>
  <pre id="json-content">{"id":"blob-1"}</pre>
</body></html>`, { url: 'https://example.test' });

        const posted: any[] = [];
        (dom.window as any).acquireVsCodeApi = () => ({ postMessage: (m: any) => posted.push(m) });
        (dom.window as any).getSelection = () => ({ toString: () => '"blob-1"' });

        (globalThis as any).window = dom.window as any;
        (globalThis as any).document = dom.window.document as any;
        (globalThis as any).HTMLElement = (dom.window as any).HTMLElement;
        (globalThis as any).acquireVsCodeApi = (dom.window as any).acquireVsCodeApi;

        const scriptPath = require.resolve('../../../media/cborViewerWebview.js');
        delete (require.cache as any)[scriptPath];
        require(scriptPath);

        const pre = dom.window.document.getElementById('json-content')!;
        assert.doesNotThrow(() => {
          pre.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, pageX: 1, pageY: 1 } as any));
        });
      });
});
