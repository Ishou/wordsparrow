import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { useBackNavigation } from '@/ui/lib/useBackNavigation';

export interface BackLinkProps {
  readonly to: LinkProps['to'];
  readonly className?: string;
  readonly children: ReactNode;
}

// Stays a real Link so middle-click, open-in-new-tab and the a11y semantics survive; `to` is the fallback the click handler uses when there is no history to walk.
export function BackLink({ to, className, children }: BackLinkProps) {
  const onBack = useBackNavigation();
  return (
    <Link to={to} onClick={onBack} className={className}>
      {children}
    </Link>
  );
}
