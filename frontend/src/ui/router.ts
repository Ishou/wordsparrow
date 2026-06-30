import { createRouter } from '@tanstack/react-router';
import type { AppRouterContext } from './routes/__root';
import { Route as RootRoute } from './routes/__root';
import { Route as AppLayoutRoute } from './routes/app-layout';
import { Route as IndexRoute } from './routes/index';
import { Route as MenuRoute } from './routes/menu';
import { Route as PlayRoute } from './routes/play';
import { Route as FinishRoute } from './routes/finish';
import { Route as GrillesRoute } from './routes/grilles';
import { Route as ReglagesRoute } from './routes/reglages';
import { Route as AideRoute } from './routes/aide';
import { Route as CompteRoute } from './routes/compte';
import { Route as AbonnementRoute } from './routes/abonnement';
import { Route as ConfidentialiteRoute } from './routes/confidentialite';
import { Route as MentionsLegalesRoute } from './routes/mentions-legales';
import { Route as LobbyRoute } from './routes/lobby.$lobbyId';
import { Route as JoinRoute } from './routes/join.$code';
import { Route as DesignSystemRoute } from './routes/design-system';
import { Route as LockupRoute } from './routes/lockup';
import {
  AccueilRedirectRoute,
  GrilleRedirectRoute,
  PrivacyRedirectRoute,
} from './routes/redirects';

// Composition root supplies `context`. Keeping `createAppRouter` a
// factory means `ui/` never instantiates `infrastructure/` directly
// (ADR-0002 §7). The `multiplayer` flag (ADR-0018 §10) gates the lobby
// route so it stays unreachable in environments where game-api is not
// yet deployed. v2 is the production app at root (ADR-0074); v1 contribuer stays on disk but unregistered.
export interface CreateAppRouterOptions {
  readonly context: AppRouterContext;
  readonly multiplayer: boolean;
}

export function createAppRouter({ context, multiplayer }: CreateAppRouterOptions) {
  // Multiplayer-flag-gated lobby/join need the game-api adapter (ADR-0018 §10); design-system + lockup stay dev-only (ADR-0072).
  const appChildren = [
    IndexRoute,
    MenuRoute,
    PlayRoute,
    FinishRoute,
    GrillesRoute,
    ReglagesRoute,
    AideRoute,
    CompteRoute,
    AbonnementRoute,
    ConfidentialiteRoute,
    MentionsLegalesRoute,
    AccueilRedirectRoute,
    GrilleRedirectRoute,
    PrivacyRedirectRoute,
    ...(multiplayer ? [LobbyRoute, JoinRoute] : []),
    ...(import.meta.env.DEV ? [DesignSystemRoute, LockupRoute] : []),
  ];
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren(appChildren)]);
  return createRouter({ routeTree, context });
}
export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
