import { createRoute, useNavigate } from '@tanstack/react-router';
import { css } from 'styled-system/css';
// Sanctioned app→module bridge (ADR-0072).
import { WinScreen } from '@/ui/play/WinScreen';
import { noindexHead } from '@/ui/seo';
import { Route as AppLayoutRoute } from './app-layout';

// Phone-shaped jade field giving the absolute-positioned WinScreen overlay a positioned ancestor.
const shell = css({ position: 'relative', width: '100%', maxWidth: '440px', marginInline: 'auto', height: '100dvh', overflow: 'hidden', bgImage: 'linear-gradient(180deg, #CDE9DA, #BBE0CD)' });

function FinishScreen() {
  const navigate = useNavigate();
  return (
    <div className={shell} lang="fr">
      <WinScreen time="04:12" onReplay={() => void navigate({ to: '/play' })} onDismiss={() => void navigate({ to: '/play' })} />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => AppLayoutRoute,
  path: 'finish',
  component: FinishScreen,
  head: () => noindexHead('Partie terminée — WordSparrow', 'Tu as terminé la grille. Bravo !'),
});
