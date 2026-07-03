import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AuthClient } from '@/application/auth';
import { SignInBanner } from '@/ui/components/sondage';

function stubAuthClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) =>
      `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
  };
}

describe('SignInBanner', () => {
  it('renders the invitation copy and a CTA pointing at signInUrl', async () => {
    const authClient = stubAuthClient();
    await act(async () => { render(<SignInBanner authClient={authClient} onClick={() => {}} />); });
    expect(
      screen.getByText(/Connectez-vous pour proposer vos propres indices/i),
    ).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /Se connecter/i });
    expect(cta.getAttribute('href')).toMatch(/^https:\/\/auth\.test\/google\?return=/);
  });

  it('fires the onClick callback when the CTA is activated', async () => {
    const authClient = stubAuthClient();
    const onClick = vi.fn();
    await act(async () => { render(<SignInBanner authClient={authClient} onClick={onClick} />); });
    const cta = screen.getByRole('link', { name: /Se connecter/i });
    fireEvent.click(cta);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ADR-0082 "Transparency": the sign-in surface must disclose email collection.
  it('discloses that signing in registers the player email for billing', async () => {
    const authClient = stubAuthClient();
    await act(async () => { render(<SignInBanner authClient={authClient} onClick={() => {}} />); });
    expect(
      screen.getByText(/adresse e-mail Google est alors enregistrée pour la facturation/i),
    ).toBeInTheDocument();
  });
});
