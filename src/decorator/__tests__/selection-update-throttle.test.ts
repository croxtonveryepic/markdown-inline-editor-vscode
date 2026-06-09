import { SelectionUpdateThrottle } from '../selection-update-throttle';

describe('SelectionUpdateThrottle', () => {
  it('runs the first call immediately (leading edge)', () => {
    vi.useFakeTimers();
    const throttle = new SelectionUpdateThrottle(16, 250);
    const cb = vi.fn();

    throttle.run(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    throttle.dispose();
    vi.useRealTimers();
  });

  it('coalesces a burst into a single trailing run with the latest callback', () => {
    vi.useFakeTimers();
    const throttle = new SelectionUpdateThrottle(16, 250);
    const leading = vi.fn();
    const dropped = vi.fn();
    const latest = vi.fn();

    throttle.run(leading); // idle -> runs now, opens 16ms window
    throttle.run(dropped); // warm -> stored as pending
    throttle.run(latest); // warm -> replaces pending (latest wins)

    expect(leading).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);

    expect(dropped).not.toHaveBeenCalled(); // intermediate trigger never runs
    expect(latest).toHaveBeenCalledTimes(1);

    throttle.dispose();
    vi.useRealTimers();
  });

  it('auto-tunes the cooldown to the measured cost of the previous pass', () => {
    vi.useFakeTimers();
    let clock = 0;
    const now = () => clock;
    const throttle = new SelectionUpdateThrottle(16, 250, now);

    const heavyPass = vi.fn(() => {
      clock += 80; // simulate an 80ms O(document) pass
    });
    const trailing = vi.fn();

    throttle.run(heavyPass); // leading run measures 80ms -> next window is 80ms
    throttle.run(trailing); // pending

    vi.advanceTimersByTime(79);
    expect(trailing).not.toHaveBeenCalled(); // cannot start before a pass-worth of time

    vi.advanceTimersByTime(1);
    expect(trailing).toHaveBeenCalledTimes(1);

    throttle.dispose();
    vi.useRealTimers();
  });

  it('clamps the cooldown to the minimum for cheap passes', () => {
    vi.useFakeTimers();
    const throttle = new SelectionUpdateThrottle(16, 250); // real Date.now -> ~0ms passes
    const leading = vi.fn();
    const trailing = vi.fn();

    throttle.run(leading);
    throttle.run(trailing);

    vi.advanceTimersByTime(15);
    expect(trailing).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(trailing).toHaveBeenCalledTimes(1);

    throttle.dispose();
    vi.useRealTimers();
  });

  it('runs immediately again once the window has elapsed (idle)', () => {
    vi.useFakeTimers();
    const throttle = new SelectionUpdateThrottle(16, 250);
    const first = vi.fn();
    const second = vi.fn();

    throttle.run(first);
    expect(first).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(16); // window closes with nothing pending -> idle

    throttle.run(second);
    expect(second).toHaveBeenCalledTimes(1); // leading edge again, no delay

    throttle.dispose();
    vi.useRealTimers();
  });

  it('cancel() drops the pending trailing run', () => {
    vi.useFakeTimers();
    const throttle = new SelectionUpdateThrottle(16, 250);
    const leading = vi.fn();
    const pending = vi.fn();

    throttle.run(leading);
    throttle.run(pending);
    throttle.cancel();

    vi.advanceTimersByTime(1000);
    expect(pending).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
