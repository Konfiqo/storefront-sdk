import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Account } from '@konfiqo/storefront-sdk';
import { useAccount } from './use-account';
import { apiError, mockClient, wrapper } from './test-utils';

const account = (): Account => ({
  email: 'a@b.co',
  name: null,
  surname: null,
  phone: null,
  savedAddresses: [],
  orders: [],
});

describe('useAccount', () => {
  it('starts loading, then signedIn with the account', async () => {
    const client = mockClient();
    client.account.get.mockResolvedValue(account());
    const { result } = renderHook(() => useAccount(), {
      wrapper: wrapper(client),
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.account).toBeNull();
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.account?.email).toBe('a@b.co');
  });

  it('is signedOut on 401 not_signed_in', async () => {
    const client = mockClient();
    client.account.get.mockRejectedValue(
      apiError('not_signed_in', 401, undefined),
    );
    const { result } = renderHook(() => useAccount(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.account).toBeNull();
  });

  it('is signedOut on a code-less 401 (unauthorized)', async () => {
    const client = mockClient();
    client.account.get.mockRejectedValue(
      apiError('unauthorized', 401, undefined),
    );
    const { result } = renderHook(() => useAccount(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('refresh reads again and can flip to signedIn', async () => {
    const client = mockClient();
    client.account.get.mockRejectedValueOnce(
      apiError('not_signed_in', 401, undefined),
    );
    const { result } = renderHook(() => useAccount(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    client.account.get.mockResolvedValue(account());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe('signedIn');
    expect(client.account.get).toHaveBeenCalledTimes(2);
  });

  it('keeps loading-free signedOut state when another error occurs', async () => {
    const client = mockClient();
    client.account.get.mockRejectedValue(
      apiError('timeout', 0, { timeoutMs: 1 }),
    );
    const { result } = renderHook(() => useAccount(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.status).toBe('signedOut');
  });
});
