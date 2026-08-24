const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  guardHeldKey,
  HOLD_WINDOW_MS,
  HOLD_SETTLE_MS,
  HOLD_BURST_ATTEMPTS,
} = require(path.join(__dirname, '..', 'out', 'hold-guard.js'));

/** A guard on a fake clock, so a held key can be simulated without waiting. */
function harness({ windowMs, settleMs, burstAttempts } = {}) {
  const state = { time: 0, runs: 0 };
  const guarded = guardHeldKey(
    async () => {
      state.runs += 1;
    },
    { windowMs, settleMs, burstAttempts, now: () => state.time },
  );
  return {
    state,
    press: () => guarded(),
    advance: ms => {
      state.time += ms;
    },
    /** Replay a burst given the gap before each invocation. */
    async replay(gaps) {
      for (const gap of gaps) {
        state.time += gap;
        await guarded();
      }
    },
  };
}

test('a single press runs the command', async () => {
  const h = harness();
  await h.press();
  assert.equal(h.state.runs, 1);
});

test('holding the key runs it exactly once, however long it is held', async () => {
  // macOS repeats as fast as every 15ms; three seconds of that is 200 events.
  const h = harness();
  await h.replay(Array(200).fill(15));
  assert.equal(h.state.runs, 1, `a three second hold fired ${h.state.runs} times`);
});

test('every plausible auto-repeat rate collapses to one run', async () => {
  for (const interval of [15, 30, 50, 100, 200, 240]) {
    const h = harness();
    await h.replay(Array(60).fill(interval));
    assert.equal(h.state.runs, 1, `${interval}ms repeat fired ${h.state.runs} times`);
  }
});

test('a burst survives the extension host stalling mid-drain', async () => {
  // Measured from a real held key: the host processes repeats late and unevenly
  // while the workbench repaints, so gaps of 300-400ms appear inside a burst
  // whose key events were 30ms apart. A plain window would break there.
  const gaps = Array(60).fill(35);
  gaps[26] = 401;
  gaps[48] = 298;
  gaps[52] = 380;

  const h = harness();
  await h.replay(gaps);
  assert.equal(h.state.runs, 1, `the stalled burst fired ${h.state.runs} times`);
});

test('two deliberate presses are still two colors', async () => {
  const h = harness();
  await h.press();
  h.advance(HOLD_WINDOW_MS + 1);
  await h.press();
  assert.equal(h.state.runs, 2);
});

test('a run of deliberate presses all land', async () => {
  // Nothing is suppressed, so the guard never decides a key is held.
  const h = harness();
  await h.replay([0, 300, 400, 300, 600, 300]);
  assert.equal(h.state.runs, 6);
});

test('the long settle applies only after a key was actually held', async () => {
  const h = harness();
  await h.press();
  // Well inside the settle window, but nothing has been suppressed yet.
  h.advance(HOLD_WINDOW_MS + 50);
  await h.press();
  assert.equal(h.state.runs, 2, 'a deliberate press was treated as a repeat');
});

test('one press after a hold works again once things go quiet', async () => {
  const h = harness();
  await h.replay(Array(60).fill(15));
  h.advance(HOLD_SETTLE_MS + 1);
  await h.press();
  assert.equal(h.state.runs, 2, 'the guard never reopened after the key was released');
});

test('it takes several suppressed repeats to decide a key is held', async () => {
  // One or two suppressed invocations are a slip of the finger, not a hold.
  const h = harness();
  await h.press();
  for (let i = 0; i < HOLD_BURST_ATTEMPTS - 1; i++) {
    h.advance(10);
    await h.press();
  }
  h.advance(HOLD_WINDOW_MS + 1);
  await h.press();
  assert.equal(h.state.runs, 2);
});

test('a press cannot overlap a run that is still going', async () => {
  // A command slower than the window would otherwise be re-entered. Nothing
  // here is awaited until the end, so the first run is genuinely still open.
  let runs = 0;
  let time = 0;
  const open = [];
  const guarded = guardHeldKey(
    () => {
      runs += 1;
      return new Promise(resolve => open.push(resolve));
    },
    { now: () => time },
  );

  const first = guarded();
  time += HOLD_SETTLE_MS * 2; // well outside every window
  await guarded();
  assert.equal(runs, 1, 'a second run started while the first was still open');

  open.forEach(finish => finish());
  await first;

  time += HOLD_SETTLE_MS * 2;
  const third = guarded();
  open.forEach(finish => finish());
  await third;
  assert.equal(runs, 2, 'the guard never reopened after the run finished');
});

test('the thresholds stay on the right side of a human', async () => {
  // Above the slowest auto-repeat, below a deliberate second press.
  assert.ok(HOLD_WINDOW_MS >= 200, `${HOLD_WINDOW_MS}ms would let a key repeat through`);
  assert.ok(HOLD_WINDOW_MS <= 300, `${HOLD_WINDOW_MS}ms would swallow a deliberate press`);
  // Long enough to outlast the worst measured stall, with room to spare.
  assert.ok(HOLD_SETTLE_MS >= 2 * 401, `${HOLD_SETTLE_MS}ms is too close to a real stall`);
});
