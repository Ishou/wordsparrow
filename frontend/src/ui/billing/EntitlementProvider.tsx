import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { BillingClient, Entitlement } from '@/application/billing';

interface EntitlementContextValue {
  readonly entitlement: Entitlement | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export interface EntitlementProviderProps {
  readonly billingClient: BillingClient;
  readonly children: ReactNode;
}

export function EntitlementProvider({ billingClient, children }: EntitlementProviderProps) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntitlement(await billingClient.getEntitlement());
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('entitlement fetch failed'));
      setEntitlement(null);
    } finally {
      setLoading(false);
    }
  }, [billingClient]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading, error, refetch }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export interface UseEntitlementResult {
  readonly tier: string | null;
  readonly status: string | null;
  readonly capabilities: readonly string[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<void>;
}

export function useEntitlement(): UseEntitlementResult {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error('useEntitlement must be used inside <EntitlementProvider>.');
  }
  const { entitlement, loading, error, refetch } = ctx;
  return {
    tier: entitlement?.tier ?? null,
    status: entitlement?.status ?? null,
    capabilities: entitlement?.capabilities ?? [],
    loading,
    error,
    refetch,
  };
}

// Render-only gate; the server still enforces the entitlement (ADR-0078).
export function useCapability(capability: string): boolean {
  return useEntitlement().capabilities.includes(capability);
}
