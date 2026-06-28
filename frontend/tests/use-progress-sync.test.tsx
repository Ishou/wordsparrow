import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { ProgressSyncService } from '@/application/progress';
import { AuthProvider } from '@/ui/components/auth';
import { useProgressSync } from '@/ui/components/auth/useProgressSync';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

function fakeAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    async whoami() {
      return whoami;
    },
    async getMe() {
      throw new Error('not used');
    },
    async updateMe() {},
    async deleteMe() {},
    async logout() {},
    signInUrl() {
      return 'https://auth.test';
    },
  };
}

function fakeService(): ProgressSyncService & {
  readonly enabledCalls: boolean[];
  pullCount: number;
} {
  return {
    enabledCalls: [],
    pullCount: 0,
    setEnabled(next: boolean) {
      this.enabledCalls.push(next);
    },
    async pullAndMergeAll() {
      this.pullCount += 1;
    },
    schedulePush() {},
    async carryOver() {},
    dispose() {},
  };
}

function Harness({ service }: { service: ProgressSyncService }) {
  useProgressSync(service);
  return <span data-testid="ready">ready</span>;
}

describe('useProgressSync', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('is a no-op when the user is anonymous', async () => {
    const service = fakeService();
    render(
      <AuthProvider authClient={fakeAuthClient(null)} getPseudonym={() => 'Renard 423'}>
        <Harness service={service} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('ready')).toBeTruthy());
    expect(service.pullCount).toBe(0);
    // The gate is told to stay disabled.
    expect(service.enabledCalls).not.toContain(true);
  });

  it('pulls + merges once and enables the gate when authed', async () => {
    const service = fakeService();
    render(
      <AuthProvider
        authClient={fakeAuthClient({ userId: USER_ID, displayName: 'Lapin 472' })}
        getPseudonym={() => 'Renard 423'}
      >
        <Harness service={service} />
      </AuthProvider>,
    );
    await waitFor(() => expect(service.pullCount).toBe(1));
    expect(service.enabledCalls).toContain(true);
  });
});
