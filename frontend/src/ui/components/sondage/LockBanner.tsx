import { css } from 'styled-system/css';
import type { Campaign } from '@/application/survey';
import { t } from '@/ui/i18n';

const bannerStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'sm',
  paddingBlock: 'sm',
  paddingInline: 'md',
  bg: 'surface',
  color: 'fgMuted',
  border: '1px solid token(colors.border)',
  borderRadius: 'md',
  fontSize: 'body',
});

interface LockBannerProps {
  readonly campaign: Campaign | null;
}

export function LockBanner({ campaign }: LockBannerProps) {
  return (
    <div
      className={bannerStyles}
      role="status"
      aria-live="polite"
      data-testid="sondage-lock-banner"
      data-batch-label={campaign?.batchLabel ?? ''}
    >
      <span>{t('sondage.lockBanner')}</span>
    </div>
  );
}

export type { LockBannerProps };
