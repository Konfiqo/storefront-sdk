import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { mountPayment } from './index';

type Win = JSDOM['window'] & { __formRuns?: number; __order?: string[] };

function dom() {
  const d = new JSDOM('<!doctype html><body><div id="pay"></div></body>', {
    runScripts: 'dangerously',
  });
  const win = d.window as Win;
  return {
    win,
    el: win.document.getElementById('pay') as unknown as HTMLElement,
  };
}

// A fake provider form: markup plus an inline script that runs only if the
// script is re-created (innerHTML alone never executes it).
const form = (marker: string) => ({
  presentation: 'embedded' as const,
  embed: {
    kind: 'iyzico-checkout-form',
    content:
      `<div id="iyzipay-checkout-form" class="responsive">${marker}</div>` +
      `<script type="text/javascript" data-provider="x">` +
      `window.__formRuns = (window.__formRuns || 0) + 1;` +
      `(window.__order = window.__order || []).push(${JSON.stringify(marker)});` +
      `</script>`,
  },
});

describe('mountPayment: embedded', () => {
  it('injects the form and executes its scripts, copying attributes', () => {
    const { win, el } = dom();
    const m = mountPayment(el, form('A'));
    expect(m.kind).toBe('embedded');
    expect(win.__formRuns).toBe(1);
    expect(el.querySelector('#iyzipay-checkout-form')?.textContent).toBe('A');
    const script = el.querySelector('script')!;
    expect(script.getAttribute('type')).toBe('text/javascript');
    expect(script.getAttribute('data-provider')).toBe('x');
  });

  it('does not re-inject or re-run on a repeat mount of the same form', () => {
    const { win, el } = dom();
    mountPayment(el, form('A'));
    mountPayment(el, form('A'));
    expect(win.__formRuns).toBe(1);
    expect(el.querySelectorAll('#iyzipay-checkout-form')).toHaveLength(1);
    expect(el.querySelectorAll('script')).toHaveLength(1);
  });

  it('replaces (never duplicates) on a mount of another form', () => {
    const { win, el } = dom();
    mountPayment(el, form('A'));
    mountPayment(el, form('B'));
    expect(win.__order).toEqual(['A', 'B']);
    expect(el.querySelectorAll('#iyzipay-checkout-form')).toHaveLength(1);
    expect(el.querySelector('#iyzipay-checkout-form')?.textContent).toBe('B');
    expect(el.querySelectorAll('script')).toHaveLength(1);
  });

  it('mounts again after unmount; a stale unmount never removes a newer form', () => {
    const { win, el } = dom();
    const first = mountPayment(el, form('A'));
    if (first.kind !== 'embedded') throw new Error('expected embedded');
    first.unmount();
    expect(el.childNodes).toHaveLength(0);
    mountPayment(el, form('A'));
    expect(win.__formRuns).toBe(2);
    first.unmount();
    expect(el.querySelectorAll('#iyzipay-checkout-form')).toHaveLength(1);
  });

  it('re-mounts when the form was removed from the element by someone else', () => {
    const { win, el } = dom();
    mountPayment(el, form('A'));
    el.replaceChildren();
    mountPayment(el, form('A'));
    expect(win.__formRuns).toBe(2);
    expect(el.querySelectorAll('#iyzipay-checkout-form')).toHaveLength(1);
  });

  it('keeps external scripts in document order (async=false) with their src', () => {
    const { el } = dom();
    mountPayment(el, {
      presentation: 'embedded',
      embed: {
        kind: 'iyzico-checkout-form',
        content:
          '<script src="https://static.provider.test/form.js" integrity="sha-x"></script>',
      },
    });
    const s = el.querySelector('script')!;
    expect(s.getAttribute('src')).toBe('https://static.provider.test/form.js');
    expect(s.getAttribute('integrity')).toBe('sha-x');
    expect(s.async).toBe(false);
  });

  it('reports an unknown embed kind without touching the element', () => {
    const { el } = dom();
    el.textContent = 'keep';
    const m = mountPayment(el, {
      presentation: 'embedded',
      embed: { kind: 'other-provider', content: '<b>x</b>' },
    });
    expect(m).toEqual({ kind: 'unsupported', embedKind: 'other-provider' });
    expect(el.textContent).toBe('keep');
  });
});

describe('mountPayment: redirect and closed', () => {
  const fakeElement = () => {
    const assign = vi.fn();
    const el = { ownerDocument: { defaultView: { location: { assign } } } };
    return { assign, el: el as unknown as HTMLElement };
  };

  it('navigates the top-level window to the url', () => {
    const { assign, el } = fakeElement();
    const m = mountPayment(el, {
      presentation: 'redirect',
      url: 'https://pay.test/s/1',
    });
    expect(assign).toHaveBeenCalledWith('https://pay.test/s/1');
    expect(m).toEqual({ kind: 'redirect', url: 'https://pay.test/s/1' });
  });

  it('refuses a non-http(s) redirect', () => {
    const { assign, el } = fakeElement();
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'not a url',
    ]) {
      expect(() => mountPayment(el, { presentation: 'redirect', url })).toThrow(
        TypeError,
      );
    }
    expect(assign).not.toHaveBeenCalled();
  });

  it('calls onClosed with the page and reports it', () => {
    const { el } = dom();
    const onClosed = vi.fn();
    const m = mountPayment(
      el,
      { presentation: 'closed', page: 'paid' },
      { onClosed },
    );
    expect(onClosed).toHaveBeenCalledWith('paid');
    expect(m).toEqual({ kind: 'closed', page: 'paid' });
    expect(
      mountPayment(el, { presentation: 'closed', page: 'processing' }),
    ).toEqual({
      kind: 'closed',
      page: 'processing',
    });
  });

  it('accepts a whole checkout result', () => {
    const { el } = dom();
    const m = mountPayment(el, {
      orderId: 'o',
      orderNumber: 'n',
      orderStatus: 'cancelled',
      presentation: 'closed',
      page: 'cancelled',
    });
    expect(m.kind).toBe('closed');
  });
});
