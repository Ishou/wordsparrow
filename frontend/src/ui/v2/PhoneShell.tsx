import type { ReactNode } from 'react';
import type { LinkProps } from '@tanstack/react-router';
import { AppShell } from './AppShell';

export interface PhoneShellProps {
  readonly children: ReactNode;
  readonly header?: ReactNode;
  // Highlights the matching desktop nav link (Accueil/Grilles); omit on pages with no top-nav home.
  readonly navActive?: 'accueil' | 'grilles';
  // Desktop-only back target; phone/tablet uses the header's BackHeader (hidden at lg).
  readonly backTo?: LinkProps['to'];
  // Header owns its own spacing (e.g. MobileTopBar): drop the slot padding + body top inset.
  readonly headerFlush?: boolean;
  // Mobile bottom nav (home/grilles only); now a shell bottom row that reserves its own space.
  readonly bottomNav?: ReactNode;
  // Deprecated no-op: the flow body is already the single scroll container.
  readonly fillBody?: boolean;
}

// Transitional shim (retired in a later phase) so v2 screens keep working while call sites migrate to AppShell.
export function PhoneShell({ children, header, navActive, backTo, headerFlush, bottomNav }: PhoneShellProps) {
  return (
    <AppShell variant="flow" topBar={header} bottomBar={bottomNav} navActive={navActive} backTo={backTo} headerFlush={headerFlush}>
      {children}
    </AppShell>
  );
}
