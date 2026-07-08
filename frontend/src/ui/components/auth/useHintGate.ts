import { useCapability } from '@/ui/components/billing/useCapability';
import { t } from '@/ui/i18n';
import { useOptionalAuth } from './AuthProvider';

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
    return { disabled: true, 'aria-disabled': true, title: t('common.loading') };
  }
  if (hasHint) return null;
  return { disabled: true, 'aria-disabled': true, title: t('auth.hintGate.anon') };
}
