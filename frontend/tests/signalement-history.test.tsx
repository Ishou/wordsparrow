import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignalementHistory } from '@/ui/components/signalements/SignalementHistory';
import type { SignalementHistoryItem, SurveyClient } from '@/application/survey';

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
  } as unknown as SurveyClient;
}

describe('SignalementHistory', () => {
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
});
