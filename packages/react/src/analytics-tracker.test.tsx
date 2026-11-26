// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAnalytics } from './analytics';
import { AnalyticsTracker } from './analytics-tracker';

const fetchMock = vi.fn();
/** Lets the queued analytics batch flush. */
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  resetAnalytics();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('AnalyticsTracker', () => {
  it('tracker sends page_view on pathname change', async () => {
    const el = (pathname = '/') => (
      <AnalyticsTracker
        baseUrl="/api"
        publishableKey="pk"
        pathname={pathname}
      />
    );
    const { rerender } = render(el());
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender(el());
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    window.history.replaceState(null, '', '/p/shirt');
    rerender(el('/p/shirt'));
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetchMock.mock.calls[1]![1].body).events[0];
    expect(sent).toMatchObject({ type: 'page_view', url: '/p/shirt' });
  });

  it('StrictMode double effects send one page_view', async () => {
    render(
      <StrictMode>
        <AnalyticsTracker baseUrl="/api" publishableKey="pk" pathname="/" />
      </StrictMode>,
    );
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { events } = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(events).toHaveLength(1);
  });
});
