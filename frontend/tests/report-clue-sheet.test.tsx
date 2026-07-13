import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportClueSheet } from '@/ui/components/grid/ReportClueSheet';
import { Toast, ToastProvider } from '@/ui/components/primitives';
import type { SurveyClient } from '@/application/survey';
import { ReportRateLimitedError } from '@/application/survey';
import { expectAxeClean } from '@/test/a11y';

function stubClient(submit = vi.fn().mockResolvedValue({ reportId: 'r-1' })): SurveyClient {
  return { submitSignalement: submit } as unknown as SurveyClient;
}

function renderSheet(node: ReactNode) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/play',
    component: () => (
      <ToastProvider>
        {node}
        <Toast />
      </ToastProvider>
    ),
  });
  const confidentialite = createRoute({
    getParentRoute: () => rootRoute,
    path: '/confidentialite',
    component: () => <p>vie privée</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route, confidentialite]),
    history: createMemoryHistory({ initialEntries: ['/play'] }),
  });
  return render(<RouterProvider router={router} />);
}

const flushDialog = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

const baseProps = {
  surface: 'solo' as const,
  clueText: 'félin domestique',
};

describe('ReportClueSheet', () => {
  beforeEach(() => localStorage.clear());

  it('exposes a report-clue trigger with an accessible name', async () => {
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient()} />);
    const trigger = await screen.findByTestId('report-clue');
    expect(trigger).toHaveAccessibleName('Signaler cette définition');
  });

  it('opens the sheet, lists the nine reasons, and submits the chosen reason + note', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient(submit)} puzzleId="p-1" />);

    fireEvent.click(await screen.findByTestId('report-clue'));
    await flushDialog();

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getAllByRole('radio')).toHaveLength(9);

    fireEvent.click(screen.getByRole('radio', { name: 'La définition ne colle pas au mot' }));
    fireEvent.change(screen.getByLabelText('Note (facultatif)'), { target: { value: 'contre-sens' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({
      clueText: 'félin domestique',
      reason: 'erreur_sens',
      surface: 'solo',
      note: 'contre-sens',
      puzzleId: 'p-1',
    });
    expect(submit.mock.calls[0][0]).not.toHaveProperty('wordText');
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Merci, c’est signalé'));
  });

  it('surfaces a distinct rate-limit toast when the client throws ReportRateLimitedError', async () => {
    const submit = vi.fn().mockRejectedValue(new ReportRateLimitedError());
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient(submit)} />);
    fireEvent.click(await screen.findByTestId('report-clue'));
    await flushDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Trop facile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(/Tu as signalé trop de fois/));
    expect(screen.getByTestId('toast')).toHaveAttribute('data-tone', 'error');
  });

  it('keeps submit disabled until a reason is chosen', async () => {
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient()} />);
    fireEvent.click(await screen.findByTestId('report-clue'));
    await flushDialog();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Trop facile' }));
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  });

  it('never sends wordText — the server resolves the answer word (ADR-0111)', async () => {
    const submit = vi.fn().mockResolvedValue({ reportId: 'r-1' });
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient(submit)} puzzleId="p-2" />);
    fireEvent.click(await screen.findByTestId('report-clue'));
    await flushDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'La définition est choquante' }));
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({
      clueText: 'félin domestique',
      reason: 'definition_offensante',
      surface: 'solo',
      note: undefined,
      puzzleId: 'p-2',
    });
    expect(submit.mock.calls[0][0]).not.toHaveProperty('wordText');
  });

  it('links to the privacy page from the point-of-collection notice', async () => {
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient()} />);
    fireEvent.click(await screen.findByTestId('report-clue'));
    await flushDialog();
    expect(screen.getByRole('link', { name: 'en savoir plus' })).toHaveAttribute('href', '/confidentialite');
  });

  it('has no critical/serious axe violations while open', async () => {
    renderSheet(<ReportClueSheet {...baseProps} surveyClient={stubClient()} />);
    fireEvent.click(await screen.findByTestId('report-clue'));
    await flushDialog();
    await expectAxeClean(screen.getByRole('dialog'));
  });
});
