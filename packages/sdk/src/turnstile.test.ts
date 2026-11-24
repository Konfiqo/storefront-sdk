import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import {
  TURNSTILE_SCRIPT_URL,
  loadTurnstile,
  renderTurnstile,
  type TurnstileApi,
} from './index';

type Win = JSDOM['window'] & { turnstile?: TurnstileApi };

function setup() {
  const dom = new JSDOM(
    '<!doctype html><head></head><body><div id="ts"></div></body>',
  );
  const win = dom.window as Win;
  const doc = win.document as unknown as Document;
  const fake = {
    render: vi.fn((_el: unknown, _p: Record<string, unknown>) => 'w-1'),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  const scripts = () => Array.from(doc.querySelectorAll('script'));
  // Simulates Cloudflare's script finishing loading.
  const finishLoad = () => {
    win.turnstile = fake as unknown as TurnstileApi;
    for (const s of scripts()) s.dispatchEvent(new win.Event('load'));
  };
  const el = doc.getElementById('ts') as HTMLElement;
  return { win, doc, fake, scripts, finishLoad, el };
}

describe('loadTurnstile', () => {
  it('injects only the official script, exactly once, for concurrent calls', async () => {
    const { doc, scripts, finishLoad, fake } = setup();
    const a = loadTurnstile(doc);
    const b = loadTurnstile(doc);
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]!.src).toBe(TURNSTILE_SCRIPT_URL);
    expect(TURNSTILE_SCRIPT_URL).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    );
    finishLoad();
    await expect(a).resolves.toBe(fake);
    await expect(b).resolves.toBe(fake);
    await loadTurnstile(doc);
    expect(scripts()).toHaveLength(1);
  });

  it('reuses a script tag the page already has', async () => {
    const { doc, scripts, finishLoad } = setup();
    const existing = doc.createElement('script');
    existing.src = TURNSTILE_SCRIPT_URL;
    doc.head.appendChild(existing);
    const p = loadTurnstile(doc);
    expect(scripts()).toHaveLength(1);
    finishLoad();
    await p;
  });

  it('rejects on a load error and can be retried', async () => {
    const { win, doc, scripts, finishLoad } = setup();
    const p = loadTurnstile(doc);
    const failed = scripts()[0]!;
    failed.dispatchEvent(new win.Event('error'));
    await expect(p).rejects.toThrow(/failed to load/);
    // The dead tag is gone, so the retry injects a fresh one.
    expect(scripts()).toHaveLength(0);
    const again = loadTurnstile(doc);
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).not.toBe(failed);
    expect(scripts()[0]!.src).toBe(TURNSTILE_SCRIPT_URL);
    finishLoad();
    await expect(again).resolves.toBeDefined();
  });
});

describe('renderTurnstile', () => {
  it('renders with the site key and wires the callbacks', async () => {
    const { doc, el, fake, finishLoad } = setup();
    const onToken = vi.fn();
    const onExpired = vi.fn();
    const onError = vi.fn();
    const p = renderTurnstile(el, '0x4AAA-site', {
      onToken,
      onExpired,
      onError,
    });
    finishLoad();
    const widget = await p;
    expect(fake.render).toHaveBeenCalledOnce();
    const [container, params] = fake.render.mock.calls[0]!;
    expect(container).toBe(el);
    expect(params.sitekey).toBe('0x4AAA-site');
    (params.callback as (t: string) => void)('tok-1');
    expect(onToken).toHaveBeenCalledWith('tok-1');
    (params['expired-callback'] as () => void)();
    expect(onExpired).toHaveBeenCalledOnce();
    (params['error-callback'] as (c: string) => void)('110200');
    expect(onError).toHaveBeenCalledWith('110200');
    expect(widget.widgetId).toBe('w-1');
    widget.reset();
    expect(fake.reset).toHaveBeenCalledWith('w-1');
    widget.remove();
    expect(fake.remove).toHaveBeenCalledWith('w-1');
    expect(doc.querySelectorAll('script')).toHaveLength(1);
  });

  it('does not inject again when turnstile is already loaded', async () => {
    const { win, doc, el, fake } = setup();
    win.turnstile = fake as unknown as TurnstileApi;
    await renderTurnstile(el, 'k', { onToken: () => {} });
    expect(doc.querySelectorAll('script')).toHaveLength(0);
  });

  it('requires a site key', async () => {
    const { el } = setup();
    await expect(
      renderTurnstile(el, '', { onToken: () => {} }),
    ).rejects.toThrow(TypeError);
  });
});
