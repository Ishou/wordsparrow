import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignalementQueue } from '@/ui/components/signalements/SignalementQueue';
import { Toast, ToastProvider } from '@/ui/components/primitives';
import type { SignalementSummary, SurveyClient } from '@/application/survey';
import type { CorrectionClient } from '@/application/correction';
import { expectAxeClean } from '@/test/a11y';

function stubCorrectionClient(): CorrectionClient {
  return {
    submitCorrection: vi.fn(),
    getCorrectionProgress: vi.fn(),
    blocklistWord: vi.fn(),
    previewBlocklist: vi.fn(),
  } as unknown as CorrectionClient;
}

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

  it('renders a word-less group without a mot and falls the action label back to the clue', async () => {
    const client = stubClient({
      listSignalements: vi.fn().mockResolvedValue([
        summary({ reportId: 'r-noword', wordText: null, clueText: 'Définition offensante', reason: 'definition_offensante' }),
      ]),
    });
    renderQueue(client);

    expect(await screen.findByText('Définition offensante')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeter les signalements sur Définition offensante' })).toBeInTheDocument();
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

  it('Marquer comme traité decides action and drops the row', async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    const client = stubClient({ decideSignalement: decide });
    renderQueue(client);

    fireEvent.click(await screen.findByRole('button', { name: /Marquer comme traité les signalements sur CHAT/ }));

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

  it('offers an enabled Blacklister le mot action for word rows and disables it for word-less rows', async () => {
    const client = stubClient({
      listSignalements: vi.fn().mockResolvedValue([
        summary({ reportId: 'r-word', wordText: 'INJURE', reason: 'mot_offensant' }),
        summary({ reportId: 'r-noword', wordText: null, clueText: 'Définition offensante', reason: 'definition_offensante' }),
      ]),
    });
    render(
      <ToastProvider>
        <SignalementQueue surveyClient={client} correctionClient={stubCorrectionClient()} />
        <Toast />
      </ToastProvider>,
    );

    await screen.findAllByTestId('signalement-row');
    const triggers = screen.getAllByTestId('blocklist-trigger');
    expect(triggers).toHaveLength(2);
    expect(triggers[0]).toBeEnabled();
    expect(triggers[1]).toBeDisabled();
    expect(screen.getByText('mot requis')).toBeInTheDocument();
  });
});
