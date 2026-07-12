import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { BlocklistWordDialog } from '@/ui/components/signalements/BlocklistWordDialog';
import { Toast, ToastProvider } from '@/ui/components/primitives';
import { createGridCorrectionClient, createHttpSurveyClient } from '@/infrastructure';

const GRID = 'http://grid.test';
const SURVEY = 'http://survey.test';
const REPORT_ID = '0190e3a4-7a2c-7c9e-8f1a-000000000001';
const CORRECTION_ID = '0190e3a4-7a2c-7c9e-8f1a-0000000000bb';

const correctionClient = createGridCorrectionClient({ baseUrl: GRID });
const surveyClient = createHttpSurveyClient({ baseUrl: SURVEY });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const click = (el: HTMLElement) => {
  el.focus();
  fireEvent.click(el);
};

const preview = (dailies = 3, solo = 128) =>
  http.get(`${GRID}/v1/corrections/blocklist-preview`, ({ request }) => {
    const word = new URL(request.url).searchParams.get('word');
    return word ? HttpResponse.json({ affectedDailies: dailies, affectedSolo: solo }) : new HttpResponse(null, { status: 400 });
  });

function renderDialog(over: { word?: string | null } = {}) {
  return render(
    <ToastProvider>
      <BlocklistWordDialog
        correctionClient={correctionClient}
        surveyClient={surveyClient}
        reportId={REPORT_ID}
        word={'word' in over ? over.word : 'CHAT'}
        pollIntervalMs={20}
      />
      <Toast />
    </ToastProvider>,
  );
}

async function openDialog() {
  click(await screen.findByTestId('blocklist-trigger'));
  await screen.findByRole('dialog');
}

describe('BlocklistWordDialog', () => {
  it('fetches and renders the impact preview counts on open', async () => {
    server.use(preview(3, 128));
    renderDialog();
    await openDialog();

    expect(await screen.findByText(/3 grille\(s\) du jour et 128 grille\(s\) libre\(s\)/)).toBeInTheDocument();
  });

  it('keeps the confirm button disabled until the exact word is typed, then blocklists, marks handled, and shows progress', async () => {
    let blocklistBody: unknown;
    let decisionBody: unknown;
    server.use(
      preview(),
      http.post(`${GRID}/v1/corrections/blocklist-word`, async ({ request }) => {
        blocklistBody = await request.json();
        return HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 });
      }),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'blocklist_word', backfillStatus: 'done', gridsMatched: 131, gridsPatched: 131 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, async ({ request }) => {
        decisionBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderDialog();
    await openDialog();
    await screen.findByText(/grille\(s\) du jour/);

    const confirmBtn = screen.getByRole('button', { name: /Confirmer le blacklistage/ });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByLabelText(/Tape « CHAT » pour confirmer/);
    fireEvent.change(input, { target: { value: 'CHIEN' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'chat' } });
    await waitFor(() => expect(confirmBtn).toBeEnabled());

    click(confirmBtn);
    await waitFor(() => expect(blocklistBody).toEqual({ wordText: 'CHAT' }));
    await waitFor(() => expect(decisionBody).toEqual({ decision: 'action' }));
    expect(await screen.findByText(/Terminé/)).toBeInTheDocument();
  });

  it('renders backfill progress then Terminé', async () => {
    let calls = 0;
    server.use(
      preview(),
      http.post(`${GRID}/v1/corrections/blocklist-word`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () => {
        calls += 1;
        return calls < 2
          ? HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'blocklist_word', backfillStatus: 'running', gridsMatched: 10, gridsPatched: 4 })
          : HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'blocklist_word', backfillStatus: 'done', gridsMatched: 10, gridsPatched: 10 });
      }),
    );

    renderDialog();
    await openDialog();
    await screen.findByText(/grille\(s\) du jour/);
    fireEvent.change(screen.getByLabelText(/pour confirmer/), { target: { value: 'CHAT' } });
    click(await screen.findByRole('button', { name: /Confirmer le blacklistage/ }));

    expect(await screen.findByText(/4\/10 grilles/)).toBeInTheDocument();
    expect(await screen.findByText(/Terminé/)).toBeInTheDocument();
  });

  it('surfaces the retry notice when the survey decision fails, then settles on Réessayer', async () => {
    let decisionCalls = 0;
    let decisionShouldFail = true;
    server.use(
      preview(),
      http.post(`${GRID}/v1/corrections/blocklist-word`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 }),
      ),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'blocklist_word', backfillStatus: 'done', gridsMatched: 5, gridsPatched: 5 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, () => {
        decisionCalls += 1;
        return decisionShouldFail ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 204 });
      }),
    );

    renderDialog();
    await openDialog();
    await screen.findByText(/grille\(s\) du jour/);
    fireEvent.change(screen.getByLabelText(/pour confirmer/), { target: { value: 'CHAT' } });
    click(await screen.findByRole('button', { name: /Confirmer le blacklistage/ }));

    expect(await screen.findByText(/n’a pas pu être marqué comme traité/)).toBeInTheDocument();
    await waitFor(() => expect(decisionCalls).toBe(1));

    decisionShouldFail = false;
    click(screen.getByRole('button', { name: /Réessayer/ }));

    expect(await screen.findByText(/Terminé/)).toBeInTheDocument();
    await waitFor(() => expect(decisionCalls).toBe(2));
  });

  it('surfaces a preview error without blocking cancel', async () => {
    server.use(
      http.get(`${GRID}/v1/corrections/blocklist-preview`, () => new HttpResponse(null, { status: 500 })),
    );
    renderDialog();
    await openDialog();

    expect(await screen.findByText(/Impossible de calculer l’impact/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmer le blacklistage/ })).toBeDisabled();
  });

  it('disables the trigger and shows a hint when the group has no wordText', async () => {
    renderDialog({ word: null });
    const btn = await screen.findByTestId('blocklist-trigger');
    expect(btn).toBeDisabled();
    expect(screen.getByText('mot requis')).toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    server.use(preview());
    const { expectAxeClean } = await import('@/test/a11y');
    renderDialog();
    await openDialog();
    await screen.findByText(/grille\(s\) du jour/);
    await act(async () => {
      await expectAxeClean(screen.getByRole('dialog'));
    });
  });
});
