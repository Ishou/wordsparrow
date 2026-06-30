import { useCapability } from '@/ui/components/billing/useCapability';
import { useOptionalAuth } from './AuthProvider';

const DISABLED_TOOLTIP_ANON = 'Connectez-vous pour utiliser les indices.';
const DISABLED_TOOLTIP_LOADING = 'Chargement…';

type GateProps = {
  readonly disabled: true;
  readonly 'aria-disabled': true;
  readonly title: string;
};

export function useHintGate(): GateProps | null {
  const auth = useOptionalAuth();
  const hasHint = useCapability('hint');
  if (!auth) return null;
  if (auth.state.status === 'loading') {
    return { disabled: true, 'aria-disabled': true, title: DISABLED_TOOLTIP_LOADING };
  }
  if (hasHint) return null;
  return { disabled: true, 'aria-disabled': true, title: DISABLED_TOOLTIP_ANON };
}
