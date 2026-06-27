import { createRoute, useNavigate } from '@tanstack/react-router';
import { css } from 'styled-system/css';
// Sanctioned app→module bridge (ADR-0072); registered only in DEV.
import { WinScreen } from '@/ui/play/WinScreen';
import { Route as V2Route } from './v2';

// Phone-shaped jade field giving the absolute-positioned WinScreen overlay a positioned ancestor.
const shell = css({ position: 'relative', width: '100%', maxWidth: '440px', marginInline: 'auto', height: '100dvh', overflow: 'hidden', bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)' });

function FinishScreen() {
  const navigate = useNavigate();
  const share = () => {
    const text = "J'ai terminé la grille WordSparrow du jour ! 🌸";
    if (typeof navigator !== 'undefined' && navigator.share) void navigator.share({ text }).catch(() => {});
    else void navigator.clipboard?.writeText(text).catch(() => {});
  };
  return (
    <div className={shell} lang="fr">
      <WinScreen time="04:12" onReplay={() => void navigate({ to: '/v2/play' })} onShare={share} onDismiss={() => void navigate({ to: '/v2/play' })} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => V2Route,
  path: 'finish',
  component: FinishScreen,
});
