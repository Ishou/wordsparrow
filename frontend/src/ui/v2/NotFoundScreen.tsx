import { useNavigate } from '@tanstack/react-router';
import { PhoneShell } from './PhoneShell';
import { SparrowState } from './SparrowState';
import { sparrowFlightScene } from './SparrowScenes';

export function NotFoundScreen() {
  const navigate = useNavigate();
  return (
    <PhoneShell>
      <SparrowState
        scene={sparrowFlightScene('404')}
        title="Cette page s'est envolée"
        body={"On n'a rien trouvé ici. Reviens à l'accueil pour jouer."}
        cta={{ label: 'Accueil', onClick: () => void navigate({ to: '/v2' }) }}
      />
    </PhoneShell>
  );
}
