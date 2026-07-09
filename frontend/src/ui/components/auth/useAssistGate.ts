import { useCapability } from '@/ui/components/billing/useCapability';
import { t } from '@/ui/i18n';
import { useOptionalAuth } from './AuthProvider';

type GateProps = {
  readonly disabled: true;
  readonly 'aria-disabled': true;
  readonly title: string;
};

// Gates the active solo assist affordance (ADR-0099's Vérifier today, hint before it); reuses the 'hint'
// capability until a lobby setting maps assist mode -> capability.
export function useAssistGate(): GateProps | null {
  const auth = useOptionalAuth();
  const hasAssist = useCapability('hint');
  if (!auth) return null;
  if (auth.state.status === 'loading') {
    return { disabled: true, 'aria-disabled': true, title: t('common.loading') };
  }
  if (hasAssist) return null;
  return { disabled: true, 'aria-disabled': true, title: t('auth.assistGate.anon') };
}
