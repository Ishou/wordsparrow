import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { CorrectionForm } from '@/ui/components/signalements/CorrectionForm';
import { Toast, ToastProvider } from '@/ui/components/primitives';
import { createGridCorrectionClient, createHttpSurveyClient } from '@/infrastructure';

const GRID = 'http://grid.test';
const SURVEY = 'http://survey.test';
const REPORT_ID = '0190e3a4-7a2c-7c9e-8f1a-000000000001';
const CORRECTION_ID = '0190e3a4-7a2c-7c9e-8f1a-0000000000aa';

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

function renderForm(over: { wordText?: string | null } = {}) {
  return render(
    <ToastProvider>
      <CorrectionForm
        correctionClient={correctionClient}
        surveyClient={surveyClient}
        reportId={REPORT_ID}
        oldClueText="Animal qui miaule"
        wordText={'wordText' in over ? over.wordText : 'CHAT'}
        pollIntervalMs={20}
      />
      <Toast />
    </ToastProvider>,
  );
}

async function openDialog() {
  click(await screen.findByRole('button', { name: /Corriger/ }));
  await screen.findByRole('dialog');
}

describe('CorrectionForm', () => {
  it('Remplacer submits a replace correction then marks the report handled', async () => {
    let correctionBody: unknown;
    let decisionBody: unknown;
    server.use(
      http.post(`${GRID}/v1/corrections`, async ({ request }) => {
        correctionBody = await request.json();
        return HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 });
      }),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'replace', backfillStatus: 'done', gridsMatched: 3, gridsPatched: 3 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, async ({ request }) => {
        decisionBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderForm();
    await openDialog();

    const input = screen.getByLabelText(/Nouvelle définition/);
    fireEvent.input(input, { target: { value: 'Félin domestique' } });
    click(screen.getByRole('button', { name: /Enregistrer la correction/ }));

    await waitFor(() => expect(correctionBody).toBeTruthy());
    expect(correctionBody).toEqual({ kind: 'replace', oldClueText: 'Animal qui miaule', newClueText: 'Félin domestique', wordText: 'CHAT' });
    await waitFor(() => expect(decisionBody).toEqual({ decision: 'action' }));
  });

  it('renders backfill progress then Terminé', async () => {
    let calls = 0;
    server.use(
      http.post(`${GRID}/v1/corrections`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () => {
        calls += 1;
        return calls < 2
          ? HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'replace', backfillStatus: 'running', gridsMatched: 3, gridsPatched: 1 })
          : HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'replace', backfillStatus: 'done', gridsMatched: 3, gridsPatched: 3 });
      }),
    );

    renderForm();
    await openDialog();
    fireEvent.input(screen.getByLabelText(/Nouvelle définition/), { target: { value: 'Félin domestique' } });
    click(screen.getByRole('button', { name: /Enregistrer la correction/ }));

    expect(await screen.findByText(/1\/3 grilles/)).toBeInTheDocument();
    expect(await screen.findByText(/Terminé/)).toBeInTheDocument();
  });

  it('renders the rejection copy on a 409 last-clue-forbidden', async () => {
    let decisionCalled = false;
    server.use(
      http.post(`${GRID}/v1/corrections`, () =>
        HttpResponse.json(
          { type: 'https://bliss.example/errors/last-clue-forbidden', title: 'Last clue forbidden', status: 409 },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, () => {
        decisionCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderForm();
    await openDialog();
    click(screen.getByRole('radio', { name: /Interdire cette définition/ }));
    click(screen.getByRole('button', { name: /Enregistrer la correction/ }));

    expect(await screen.findByText(/la seule du mot/)).toBeInTheDocument();
    expect(decisionCalled).toBe(false);
  });

  it('disables Interdire and shows a hint when the group has no wordText', async () => {
    renderForm({ wordText: null });
    await openDialog();

    const forbid = screen.getByRole('radio', { name: /Interdire cette définition/ });
    expect(forbid).toBeDisabled();
    expect(screen.getByText(/mot requis pour interdire/)).toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    const { expectAxeClean } = await import('@/test/a11y');
    renderForm();
    await openDialog();
    await act(async () => {
      await expectAxeClean(screen.getByRole('dialog'));
    });
  });
});
