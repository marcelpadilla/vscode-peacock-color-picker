/**
 * Behaviour checks for the picker webview, run against the real page in
 * headless Chrome.
 *
 * The webview is the largest single file here and none of it can be reached
 * from the extension host tests: it is DOM behaviour, so it needs a DOM. Chrome
 * is driven over the DevTools protocol rather than through a browser automation
 * dependency, which keeps this to the standard library.
 *
 * Run with `npm run test:webview`.
 */
const { execFile } = require('node:child_process');
const { buildPage, findChrome } = require('./picker-page');

const PORT = 9444;

const chromePath = findChrome();
if (!chromePath) {
  // Loud rather than silent: a skipped check must not read as a passing one.
  console.log('SKIP  the picker checks need Chrome or Chromium, which is not installed');
  process.exit(0);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

async function connect(page) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = list.find(t => t.type === 'page' && t.url.startsWith('file://'));
      if (target) {
        return target;
      }
    } catch {
      // Chrome is not listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome never opened ${page}`);
}

/** A minimal DevTools client: enough to evaluate expressions in the page. */
async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  await new Promise(resolve => ws.addEventListener('open', resolve));

  return {
    close: () => ws.close(),
    async evaluate(expression) {
      const mine = ++id;
      const reply = await new Promise(resolve => {
        pending.set(mine, resolve);
        ws.send(
          JSON.stringify({
            id: mine,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true },
          }),
        );
      });
      if (reply.result?.exceptionDetails) {
        throw new Error(JSON.stringify(reply.result.exceptionDetails.exception));
      }
      return reply.result?.result?.value;
    },
  };
}

async function withPage(options, body) {
  const page = buildPage(options);
  const chrome = execFile(chromePath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${page.dir}/profile`,
    '--window-size=900,400',
    `file://${page.html}`,
  ]);
  try {
    const client = await attach(await connect(page.html));
    // The page announces itself, then the host answers with the initial color.
    await new Promise(resolve => setTimeout(resolve, 1200));
    await body(client);
    client.close();
  } finally {
    chrome.kill();
    page.cleanup();
  }
}

async function main() {
  await withPage({ tab: 'palette' }, async client => {
    /*
     * Choosing a swatch is choosing a new color, so it has to re-anchor the
     * lighten/darken offset. Going through `commit` instead of `pick` left the
     * slider reading an offset against the previous color, and the next nudge
     * jumped somewhere unrelated to the swatch just clicked.
     */
    const clicked = JSON.parse(
      await client.evaluate(`
        (async () => {
          const steps = document.getElementById('steps');
          const out = document.getElementById('steps-out');
          steps.value = '4';
          steps.dispatchEvent(new Event('input', { bubbles: true }));
          const afterNudge = out.textContent;

          const chip = document.querySelectorAll('.chip')[25];
          const wanted = chip.title;
          chip.click();
          await new Promise(r => setTimeout(r, 50));

          return JSON.stringify({
            afterNudge,
            stepsAfterChip: out.textContent,
            hexField: document.getElementById('hex').value,
            wanted,
            applied: window.__sent.filter(m => m.type === 'apply').pop()?.color,
          });
        })()
      `),
    );
    check('the offset slider moves at all', clicked.afterNudge === '+4', clicked.afterNudge);
    check(
      'choosing a swatch resets the lighten/darken offset',
      clicked.stepsAfterChip === '0',
      `the slider still read ${clicked.stepsAfterChip}`,
    );
    check(
      'the swatch you clicked is the color you get',
      clicked.hexField === clicked.wanted && clicked.applied === clicked.wanted,
      `wanted ${clicked.wanted}, field ${clicked.hexField}, applied ${clicked.applied}`,
    );

    // The ring marking the color in use needs the grid to have been indexed.
    const ringed = JSON.parse(
      await client.evaluate(`
        JSON.stringify({
          count: document.querySelectorAll('.chip[data-selected="true"]').length,
          title: document.querySelector('.chip[data-selected="true"]')?.title,
          hex: document.getElementById('hex').value,
        })
      `),
    );
    check(
      'the swatch in use is ringed, and only that one',
      ringed.count === 1 && ringed.title === ringed.hex,
      `${ringed.count} ringed, ${ringed.title} vs ${ringed.hex}`,
    );

    const anchor = JSON.parse(
      await client.evaluate(`
        (async () => {
          const before = document.getElementById('hex').value;
          const steps = document.getElementById('steps');
          steps.value = '3';
          steps.dispatchEvent(new Event('input', { bubbles: true }));
          const lightened = document.getElementById('hex').value;
          steps.value = '0';
          steps.dispatchEvent(new Event('input', { bubbles: true }));
          return JSON.stringify({ before, lightened, back: document.getElementById('hex').value });
        })()
      `),
    );
    check(
      'the offset anchors to the swatch chosen, and zero returns it exactly',
      anchor.back === anchor.before && anchor.lightened !== anchor.before,
      `${anchor.before} -> ${anchor.lightened} -> ${anchor.back}`,
    );

    const tabs = await client.evaluate(
      `[...document.querySelectorAll('.pane')].filter(p => p.dataset.active === 'true').length`,
    );
    check('exactly one pane is showing', tabs === 1, `${tabs} panes active`);

    const errors = await client.evaluate(
      `JSON.stringify(window.__sent.filter(m => m.type === 'error'))`,
    );
    check('the page reported no script errors', errors === '[]', errors);
  });

  // Webview state outlives the extension that wrote it, so a tab name from an
  // older version must not leave every pane hidden.
  await withPage({ tab: 'a-tab-from-an-older-version' }, async client => {
    const active = await client.evaluate(
      `[...document.querySelectorAll('.pane')].filter(p => p.dataset.active === 'true').map(p => p.dataset.pane).join(',')`,
    );
    check(
      'an unknown saved tab falls back rather than showing nothing',
      active === 'palette',
      `active panes: "${active}"`,
    );
  });
}

main().then(
  () => {
    for (const result of results) {
      console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}`);
      if (!result.ok) {
        console.log(`        ${result.detail}`);
      }
    }
    const failed = results.filter(result => !result.ok).length;
    console.log(`\n${results.length - failed}/${results.length} picker checks passed`);
    process.exit(failed ? 1 : 0);
  },
  error => {
    console.error(error);
    process.exit(1);
  },
);
