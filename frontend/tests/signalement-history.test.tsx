import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignalementHistory } from '@/ui/components/signalements/SignalementHistory';
import { Toast, ToastProvider } from '@/ui/components/primitives';
import type { SignalementHistoryItem, SurveyClient } from '@/application/survey';
import type { CorrectionClient } from '@/application/correction';

function item(over: Partial<SignalementHistoryItem> = {}): SignalementHistoryItem {
  return {
    reportId: '0190e3a4-7a2c-7c9e-8f1a-000000000001',
    wordText: 'CHAT',
    clueText: 'Animal qui miaule',
    reason: 'erreur_sens',
    surface: 'daily',
    puzzleId: null,
    note: 'contre-sens',
    decision: 'action',
    triagedAt: '2026-07-11T12:00:00Z',
    ...over,
  };
}

function stubClient(items: ReadonlyArray<SignalementHistoryItem>): SurveyClient {
  return {
    listHandledSignalements: vi.fn().mockResolvedValue(items),
    undoSignalement: vi.fn().mockResolvedValue(undefined),
  } as unknown as SurveyClient;
}

describe('SignalementHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-11T14:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a Traité chip for an actioned report and a Rejeté chip for a dismissed one', async () => {
    render(
      <SignalementHistory
        surveyClient={stubClient([
          item({ reportId: 'r-a', wordText: 'CHAT', decision: 'action' }),
          item({ reportId: 'r-d', wordText: 'CHIEN', decision: 'dismiss' }),
        ])}
      />,
    );

    expect(await screen.findByText('CHAT')).toBeInTheDocument();
    expect(screen.getByText('Traité')).toBeInTheDocument();
    expect(screen.getByText('Rejeté')).toBeInTheDocument();
    expect(screen.getAllByText('il y a 2 h')).toHaveLength(2);
  });

  it('shows the empty state when there is no handled report', async () => {
    render(<SignalementHistory surveyClient={stubClient([])} />);

    expect(await screen.findByText('Aucun signalement traité pour le moment.')).toBeInTheDocument();
  });

  it('shows an error alert when the fetch fails', async () => {
    const client = { listHandledSignalements: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as SurveyClient;
    render(<SignalementHistory surveyClient={client} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('requires confirmation before reopening: reverses the correction, undoes the decision, drops the card and toasts', async () => {
    const survey = stubClient([item({ reportId: 'r-a', wordText: 'CHAT', clueText: 'Animal qui miaule' })]);
    const correction = {
      reverseCorrection: vi.fn().mockResolvedValue('forbid_clue'),
    } as unknown as CorrectionClient;

    render(
      <ToastProvider>
        <SignalementHistory surveyClient={survey} correctionClient={correction} />
        <Toast />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir le signalement sur CHAT et annuler la correction' }));
    expect(await screen.findByText('Réouvrir ce signalement ?')).toBeInTheDocument();
    expect(correction.reverseCorrection).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir' }));

    await waitFor(() => expect(screen.queryByText('CHAT')).not.toBeInTheDocument());
    expect(correction.reverseCorrection).toHaveBeenCalledWith('Animal qui miaule', 'CHAT');
    expect(survey.undoSignalement).toHaveBeenCalledWith('r-a');
    expect(await screen.findByText('Signalement réouvert ; correction annulée.')).toBeInTheDocument();
  });

  it('cancelling the confirmation dialog does not reverse the correction', async () => {
    const survey = stubClient([item({ reportId: 'r-a', wordText: 'CHAT' })]);
    const correction = { reverseCorrection: vi.fn() } as unknown as CorrectionClient;

    render(
      <ToastProvider>
        <SignalementHistory surveyClient={survey} correctionClient={correction} />
        <Toast />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir le signalement sur CHAT et annuler la correction' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(correction.reverseCorrection).not.toHaveBeenCalled();
    expect(screen.getByText('CHAT')).toBeInTheDocument();
  });

  it('uses the no-correction confirmation copy for a dismissed report', async () => {
    const survey = stubClient([item({ reportId: 'r-d', wordText: 'CHIEN', decision: 'dismiss' })]);
    const correction = { reverseCorrection: vi.fn().mockResolvedValue(null) } as unknown as CorrectionClient;

    render(
      <ToastProvider>
        <SignalementHistory surveyClient={survey} correctionClient={correction} />
        <Toast />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir le signalement sur CHIEN' }));

    expect(await screen.findByText('Le signalement repasse dans la file À traiter. Aucune correction n’a été appliquée, donc rien n’est annulé.')).toBeInTheDocument();
  });

  it('keeps the card and shows a retry-safe toast when the grid correction reversed but the survey undo failed', async () => {
    const survey = stubClient([item({ reportId: 'r-a', wordText: 'CHAT' })]);
    survey.undoSignalement = vi.fn().mockRejectedValue(new Error('boom'));
    const correction = { reverseCorrection: vi.fn().mockResolvedValue('forbid_clue') } as unknown as CorrectionClient;

    render(
      <ToastProvider>
        <SignalementHistory surveyClient={survey} correctionClient={correction} />
        <Toast />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir le signalement sur CHAT et annuler la correction' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir' }));

    expect(await screen.findByText('La correction est annulée, mais le signalement n’a pas pu repasser en file. Réessaie.')).toBeInTheDocument();
    expect(screen.getByText('CHAT')).toBeInTheDocument();
    expect(correction.reverseCorrection).toHaveBeenCalledTimes(1);
  });

  it('keeps the card and shows an error toast when the correction reverse fails', async () => {
    const survey = stubClient([item({ reportId: 'r-a', wordText: 'CHAT' })]);
    const correction = {
      reverseCorrection: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as CorrectionClient;

    render(
      <ToastProvider>
        <SignalementHistory surveyClient={survey} correctionClient={correction} />
        <Toast />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir le signalement sur CHAT et annuler la correction' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Réouvrir' }));

    expect(await screen.findByText('Réouverture impossible pour le moment. Réessaie.')).toBeInTheDocument();
    expect(screen.getByText('CHAT')).toBeInTheDocument();
    expect(survey.undoSignalement).not.toHaveBeenCalled();
  });

  it('does not render a Réouvrir button without a correction client', async () => {
    render(<SignalementHistory surveyClient={stubClient([item({ wordText: 'CHAT' })])} />);

    expect(await screen.findByText('CHAT')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Réouvrir/ })).not.toBeInTheDocument();
  });
});
