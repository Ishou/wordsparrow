import { createRouter } from '@tanstack/react-router';
import type { AppRouterContext } from './routes/__root';
import { Route as RootRoute } from './routes/__root';
import { Route as AccueilRoute } from './routes/accueil';
import { Route as GrilleRoute } from './routes/grille';
import { Route as GrillesRoute } from './routes/grilles';
import { Route as AideRoute } from './routes/aide';
import { Route as CompteRoute } from './routes/compte';
import { Route as JoinRoute } from './routes/join.$code';
import { Route as LobbyRoute } from './routes/lobby.$lobbyId';
import { Route as ConfidentialiteRoute } from './routes/confidentialite';
import { Route as PrivacyRoute } from './routes/privacy';
import { Route as LegalNoticeRoute } from './routes/mentions-legales';
import { Route as ContribuerRoute } from './routes/contribuer';
import { Route as ContribuerPairsRoute } from './routes/contribuer.pairs';
import { Route as V2Route } from './routes/v2';
import { Route as V2IndexRoute } from './routes/v2.index';
import { Route as V2MenuRoute } from './routes/v2.menu';
import { Route as V2MentionsLegalesRoute } from './routes/v2.mentions-legales';
import { Route as V2ConfidentialiteRoute } from './routes/v2.confidentialite';
import { Route as V2ReglagesRoute } from './routes/v2.reglages';
import { Route as V2GrillesRoute } from './routes/v2.grilles';
import { Route as V2LobbyRoute } from './routes/v2.lobby.$lobbyId';
import { Route as DesignSystemRoute } from './routes/design-system';
import { Route as PlayRoute } from './routes/play';
import { Route as HomeRoute } from './routes/home';
import { Route as FinishRoute } from './routes/finish';
import { Route as LockupRoute } from './routes/lockup';

// Composition root supplies `context`. Keeping `createAppRouter` a
// factory means `ui/` never instantiates `infrastructure/` directly
// (ADR-0002 §7). The `multiplayer` flag (ADR-0018 §10) gates the lobby
// route so it stays unreachable in environments where game-api is not
// yet deployed.
export interface CreateAppRouterOptions {
  readonly context: AppRouterContext;
  readonly multiplayer: boolean;
}

export function createAppRouter({ context, multiplayer }: CreateAppRouterOptions) {
  const baseChildren = [
    AccueilRoute,
    GrilleRoute,
    GrillesRoute,
    AideRoute,
    CompteRoute,
    ConfidentialiteRoute,
    PrivacyRoute,
    LegalNoticeRoute,
    ContribuerRoute,
    ContribuerPairsRoute,
  ];
  // Multiplayer-flag-gated routes: lobby + the `/join/$code` share-link
  // landing both require the game-api adapter on the router context.
  // Dev-only v2 design-system screens (ADR-0072) under a gated /v2 parent — never registered in prod.
  // The v2 lobby reskin is DEV-AND-multiplayer gated (it needs the game-api adapter), mirroring prod `/lobby`.
  const v2Children = [
    V2IndexRoute,
    HomeRoute,
    V2MenuRoute,
    PlayRoute,
    FinishRoute,
    LockupRoute,
    DesignSystemRoute,
    V2MentionsLegalesRoute,
    V2ConfidentialiteRoute,
    V2ReglagesRoute,
    V2GrillesRoute,
    ...(multiplayer ? [V2LobbyRoute] : []),
  ];
  const devChildren = import.meta.env.DEV ? [V2Route.addChildren(v2Children)] : [];
  const children = multiplayer
    ? [...baseChildren, JoinRoute, LobbyRoute, ...devChildren]
    : [...baseChildren, ...devChildren];
  const routeTree = RootRoute.addChildren(children);
  return createRouter({ routeTree, context });
}
export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
