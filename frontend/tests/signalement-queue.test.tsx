import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignalementQueue } from '@/ui/components/signalements/SignalementQueue';
import { Toast, ToastProvider } from '@/ui/components/primitives';
import type { SignalementSummary, SurveyClient } from '@/application/survey';
import { expectAxeClean } from '@/test/a11y';

function summary(over: Partial<SignalementSummary> = {}): SignalementSummary {
  return {
    reportId: '0190e3a4-7a2c-7c9e-8f1a-000000000001',
    wordText: 'CHAT',
    clueText: 'Animal qui miaule',
    reason: 'erreur_sens',
    count: 2,
    latestNote: 'contre-sens',
    latestAt: '2026-07-11T10:00:00Z',
    ...over,
  };
}

function stubClient(over: Partial<SurveyClient> = {}): SurveyClient {
  return {
    listSignalements: vi.fn().mockResolvedValue([summary()]),
    decideSignalement: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as SurveyClient;
}

function renderQueue(client: SurveyClient) {
  return render(
    <ToastProvider>
      <SignalementQueue surveyClient={client} />
      <Toast />
    </ToastProvider>,
  );
}

describe('SignalementQueue', () => {
  it('renders one row per group with mot clue reason count and latest note', async () => {
    renderQueue(stubClient());

    expect(await screen.findByText('CHAT')).toBeInTheDocument();
    expect(screen.getByText('Animal qui miaule')).toBeInTheDocument();
    expect(screen.getByText(/La définition ne colle pas au mot/)).toBeInTheDocument();
    expect(screen.getByText(/2 signalements/)).toBeInTheDocument();
    expect(screen.getByText(/contre-sens/)).toBeInTheDocument();
  });

  it('sorts harm reasons before quality reasons', async () => {
    const client = stubClient({
      listSignalements: vi.fn().mockResolvedValue([
        summary({ reportId: 'r-quality', wordText: 'FACILE', reason: 'trop_facile' }),
        summary({ reportId: 'r-harm', wordText: 'INJURE', reason: 'mot_offensant' }),
      ]),
    });
    renderQueue(client);

    await screen.findByText('INJURE');
    const rows = screen.getAllByTestId('signalement-row');
    expect(rows[0]).toHaveTextContent('INJURE');
    expect(rows[1]).toHaveTextContent('FACILE');
  });

  it('Rejeter decides dismiss and drops the row', async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    const client = stubClient({ decideSignalement: decide });
    renderQueue(client);

    fireEvent.click(await screen.findByRole('button', { name: /Rejeter les signalements sur CHAT/ }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith('0190e3a4-7a2c-7c9e-8f1a-000000000001', 'dismiss'));
    await waitFor(() => expect(screen.queryByText('CHAT')).not.toBeInTheDocument());
  });

  it('Corriger opens the correctif dialog prefilled and applies as action', async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    const client = stubClient({ decideSignalement: decide });
    renderQueue(client);

    fireEvent.click(await screen.findByRole('button', { name: /Corriger la définition de CHAT/ }));

    const dialog = await screen.findByTestId('signalement-corriger-dialog');
    expect(dialog).toHaveTextContent('Corriger « CHAT »');
    const altInput = screen.getByLabelText('Définition alternative') as HTMLInputElement;
    expect(altInput.value).toBe('Animal qui miaule');

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer et clôturer' }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith('0190e3a4-7a2c-7c9e-8f1a-000000000001', 'action'));
    await waitFor(() => expect(screen.queryByText('CHAT')).not.toBeInTheDocument());
  });

  it('shows the empty state when there are no pending reports', async () => {
    renderQueue(stubClient({ listSignalements: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText(/Aucun signalement en attente/)).toBeInTheDocument();
  });

  it('shows an error when the fetch fails', async () => {
    renderQueue(stubClient({ listSignalements: vi.fn().mockRejectedValue(new Error('boom')) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de charger/);
  });

  it('has no axe violations', async () => {
    const { container } = renderQueue(stubClient());
    await screen.findByText('CHAT');
    await expectAxeClean(container);
  });
});
