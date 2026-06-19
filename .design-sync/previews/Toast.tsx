import { useEffect } from 'react';
import { ToastProvider, Toast, useToast } from '@bliss/frontend';

function Emit({ text, tone }: { text: string; tone: 'info' | 'error' }) {
  const { show } = useToast();
  // duration null → the toast stays mounted for a static screenshot.
  useEffect(() => {
    show({ text, tone, duration: null });
  }, [show, text, tone]);
  return <Toast />;
}

// The toast is `position: fixed` (bottom-right corner notification). A
// transformed, sized ancestor becomes its containing block, so it renders
// fully inside the preview cell instead of escaping to the viewport edge.
function Stage({ text, tone }: { text: string; tone: 'info' | 'error' }) {
  return (
    <ToastProvider>
      <div style={{ position: 'relative', transform: 'translateZ(0)', width: 470, height: 140 }}>
        <Emit text={text} tone={tone} />
      </div>
    </ToastProvider>
  );
}

export const Info = () => <Stage text="Grille enregistrée." tone="info" />;

export const ErrorToast = () => (
  <Stage text="Connexion perdue. Nouvelle tentative…" tone="error" />
);
