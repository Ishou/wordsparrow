import { UsersThree } from '@phosphor-icons/react';
import { t } from '@/ui/i18n';
import { SignInSheet } from '@/ui/v2/SignInSheet';
import type { AuthClient } from '@/application/auth';

export function HostSignInSheet({
  open,
  authClient,
  onClose,
}: {
  readonly open: boolean;
  readonly authClient?: AuthClient;
  readonly onClose: () => void;
}) {
  return (
    <SignInSheet
      open={open}
      authClient={authClient}
      onClose={onClose}
      icon={UsersThree}
      title={t('home.host.signInPrompt')}
      description={t('home.host.subtitle')}
      backdropTestId="host-signin-sheet-backdrop"
    />
  );
}
