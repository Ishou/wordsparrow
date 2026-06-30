import { useCapabilityGate, type CapabilityGateStatus } from './useCapabilityGate';

export type BillingGateStatus = CapabilityGateStatus;

// Render-only gate from identity session capabilities; the server enforces (ADR-0078). `denied` renders the standard 404.
export function useBillingGate(capability = 'billing:subscribe'): BillingGateStatus {
  return useCapabilityGate(capability);
}
