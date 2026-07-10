import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProgressSyncService } from '@/application/progress';
import { useProgressRevision } from '@/ui/lib/useProgressRevision';

// Minimal fake with a real subscribe/getRevision and a manual merge trigger.
function fakeService(): ProgressSyncService & { fireMerge: () => void } {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    setEnabled: () => {},
    pullAndMergeAll: async () => {},
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRevision: () => revision,
    fireMerge: () => {
      revision += 1;
      for (const l of listeners) l();
    },
  };
}

function Probe({ service }: { service?: ProgressSyncService }) {
  const rev = useProgressRevision(service);
  return <output>rev={rev}</output>;
}

describe('useProgressRevision', () => {
  it('returns 0 with no service', () => {
    render(<Probe service={undefined} />);
    expect(screen.getByText('rev=0')).toBeInTheDocument();
  });

  it('re-renders with the new revision when the service notifies', () => {
    const service = fakeService();
    render(<Probe service={service} />);
    expect(screen.getByText('rev=0')).toBeInTheDocument();
    act(() => service.fireMerge());
    expect(screen.getByText('rev=1')).toBeInTheDocument();
  });
});
