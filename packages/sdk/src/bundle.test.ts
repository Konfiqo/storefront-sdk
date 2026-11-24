import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const entry = fileURLToPath(new URL('./index.ts', import.meta.url));

async function bundle(platform: 'browser' | 'node'): Promise<string> {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform,
    format: platform === 'browser' ? 'iife' : 'cjs',
    globalName: 'StorefrontSDK',
    target: 'es2022',
    logLevel: 'silent',
  });
  return out.outputFiles[0]!.text;
}

type Sdk = typeof import('./index');

describe('bundles', () => {
  it('runs as a browser bundle (no Node builtins), with the trusted key refused', async () => {
    const code = await bundle('browser');
    expect(code).not.toMatch(/\brequire\(/);
    const dom = new JSDOM('<!doctype html><div id="pay"></div>', {
      runScripts: 'dangerously',
    });
    const script = dom.window.document.createElement('script');
    script.textContent = code;
    dom.window.document.body.appendChild(script);
    const sdk = (dom.window as unknown as { StorefrontSDK: Sdk }).StorefrontSDK;
    const client = sdk.createStorefrontClient({
      baseUrl: 'https://api.test',
      publishableKey: 'pk_live_x',
    });
    expect(client.media.url('a/b.png')).toBe(
      'https://api.test/v1/media/a/b.png?pk=pk_live_x',
    );
    expect(() =>
      sdk.createStorefrontClient({
        baseUrl: 'https://api.test',
        publishableKey: 'pk_live_x',
        trustedStorefrontKey: 'sk',
        buyerIp: '1.2.3.4',
      }),
    ).toThrow(/server-only/);
    const el = dom.window.document.getElementById(
      'pay',
    ) as unknown as HTMLElement;
    expect(
      sdk.mountPayment(el, { presentation: 'closed', page: 'paid' }).kind,
    ).toBe('closed');
  });

  it('runs as a Node bundle without window, with the trusted key allowed', async () => {
    const code = await bundle('node');
    const module = { exports: {} as Sdk };
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      URLSearchParams,
      AbortController,
      setTimeout,
      clearTimeout,
    });
    const sdk = module.exports;
    expect(() =>
      sdk.createStorefrontClient({
        baseUrl: 'https://api.test',
        publishableKey: 'pk_live_x',
        trustedStorefrontKey: 'sk',
        buyerIp: '1.2.3.4',
      }),
    ).not.toThrow();
    expect(sdk.formatMoney(14990, 'TRY', 'tr-TR')).toBe('₺149,90');
  });
});
