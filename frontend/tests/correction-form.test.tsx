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

  it('surfaces the retry notice when the survey decision fails, then settles on Réessayer', async () => {
    let decisionCalls = 0;
    let decisionShouldFail = true;
    server.use(
      http.post(`${GRID}/v1/corrections`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 }),
      ),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'replace', backfillStatus: 'done', gridsMatched: 3, gridsPatched: 3 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, () => {
        decisionCalls += 1;
        return decisionShouldFail ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 204 });
      }),
    );

    renderForm();
    await openDialog();
    fireEvent.input(screen.getByLabelText(/Nouvelle définition/), { target: { value: 'Félin domestique' } });
    click(screen.getByRole('button', { name: /Enregistrer la correction/ }));

    expect(await screen.findByText(/marqué comme traité/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enregistrer la correction/ })).toBeNull();
    await waitFor(() => expect(decisionCalls).toBe(1));

    decisionShouldFail = false;
    click(screen.getByRole('button', { name: /Réessayer/ }));

    expect(await screen.findByText(/Terminé/)).toBeInTheDocument();
    expect(screen.queryByText(/marqué comme traité/)).toBeNull();
    await waitFor(() => expect(decisionCalls).toBe(2));
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

  it('picker lists the word’s other clues and submits the chosen one', async () => {
    let correctionBody: unknown;
    let decisionBody: unknown;
    server.use(
      http.get(`${GRID}/v1/words/CHAT/clues`, () =>
        HttpResponse.json({
          clues: [
            { text: 'Animal qui miaule', theme: null },
            { text: 'Félin domestique', theme: null },
            { text: 'Matou', theme: 'animaux' },
          ],
        }),
      ),
      http.post(`${GRID}/v1/corrections`, async ({ request }) => {
        correctionBody = await request.json();
        return HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 });
      }),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'replace', backfillStatus: 'done', gridsMatched: 2, gridsPatched: 2 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, async ({ request }) => {
        decisionBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderForm();
    await openDialog();
    click(screen.getByRole('radio', { name: /Choisir parmi les autres définitions/ }));

    expect(await screen.findByRole('radio', { name: /Félin domestique/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Animal qui miaule/ })).toBeNull();
    expect(screen.getByText('animaux')).toBeInTheDocument();

    click(screen.getByRole('radio', { name: /Matou/ }));
    click(screen.getByRole('button', { name: /Enregistrer la correction/ }));

    await waitFor(() =>
      expect(correctionBody).toEqual({ kind: 'replace', oldClueText: 'Animal qui miaule', newClueText: 'Matou', wordText: 'CHAT' }),
    );
    await waitFor(() => expect(decisionBody).toEqual({ decision: 'action' }));
  });

  it('shows a graceful message on no other clue and keeps the free-text path', async () => {
    let correctionBody: unknown;
    server.use(
      http.get(`${GRID}/v1/words/CHAT/clues`, () =>
        HttpResponse.json({ clues: [{ text: 'Animal qui miaule', theme: null }] }),
      ),
      http.post(`${GRID}/v1/corrections`, async ({ request }) => {
        correctionBody = await request.json();
        return HttpResponse.json({ correctionId: CORRECTION_ID, backfillStatus: 'pending' }, { status: 202 });
      }),
      http.get(`${GRID}/v1/corrections/${CORRECTION_ID}`, () =>
        HttpResponse.json({ correctionId: CORRECTION_ID, kind: 'replace', backfillStatus: 'done', gridsMatched: 1, gridsPatched: 1 }),
      ),
      http.post(`${SURVEY}/v1/signalements/${REPORT_ID}/decision`, () => new HttpResponse(null, { status: 204 })),
    );

    renderForm();
    await openDialog();
    click(screen.getByRole('radio', { name: /Choisir parmi les autres définitions/ }));

    expect(await screen.findByText(/Pas d.autre définition/)).toBeInTheDocument();

    click(screen.getByRole('radio', { name: /Écrire une nouvelle définition/ }));
    fireEvent.input(screen.getByLabelText(/Nouvelle définition/), { target: { value: 'Félin domestique' } });
    click(screen.getByRole('button', { name: /Enregistrer la correction/ }));

    await waitFor(() =>
      expect(correctionBody).toEqual({ kind: 'replace', oldClueText: 'Animal qui miaule', newClueText: 'Félin domestique', wordText: 'CHAT' }),
    );
  });

  it('falls back gracefully when the clue fetch fails', async () => {
    server.use(http.get(`${GRID}/v1/words/CHAT/clues`, () => new HttpResponse(null, { status: 500 })));

    renderForm();
    await openDialog();
    click(screen.getByRole('radio', { name: /Choisir parmi les autres définitions/ }));

    expect(await screen.findByText(/Impossible de charger/)).toBeInTheDocument();

    click(screen.getByRole('radio', { name: /Écrire une nouvelle définition/ }));
    expect(screen.getByLabelText(/Nouvelle définition/)).toBeInTheDocument();
  });

  it('hides the picker option when the report has no resolved word', async () => {
    renderForm({ wordText: null });
    await openDialog();
    expect(screen.queryByRole('radio', { name: /Choisir parmi les autres définitions/ })).toBeNull();
    expect(screen.getByLabelText(/Nouvelle définition/)).toBeInTheDocument();
  });

  it('re-disables submit after write→pick→write leaves the field empty', async () => {
    server.use(
      http.get(`${GRID}/v1/words/CHAT/clues`, () =>
        HttpResponse.json({ clues: [{ text: 'Animal qui miaule', theme: null }, { text: 'Matou', theme: 'animaux' }] }),
      ),
    );
    renderForm();
    await openDialog();
    const submit = () => screen.getByRole('button', { name: /Enregistrer la correction/ });
    fireEvent.input(screen.getByLabelText(/Nouvelle définition/), { target: { value: 'Félin domestique' } });
    expect(submit()).toBeEnabled();
    click(screen.getByRole('radio', { name: /Choisir parmi les autres définitions/ }));
    await screen.findByRole('radio', { name: /Matou/ });
    click(screen.getByRole('radio', { name: /Écrire une nouvelle définition/ }));
    expect(screen.getByLabelText(/Nouvelle définition/)).toHaveValue('');
    expect(submit()).toBeDisabled();
  });

  it('re-disables submit after replace→forbid→replace leaves the field empty', async () => {
    renderForm();
    await openDialog();
    const submit = () => screen.getByRole('button', { name: /Enregistrer la correction/ });
    fireEvent.input(screen.getByLabelText(/Nouvelle définition/), { target: { value: 'Félin domestique' } });
    expect(submit()).toBeEnabled();
    click(screen.getByRole('radio', { name: /Interdire cette définition/ }));
    click(screen.getByRole('radio', { name: /Remplacer la définition/ }));
    expect(screen.getByLabelText(/Nouvelle définition/)).toHaveValue('');
    expect(submit()).toBeDisabled();
  });

  it('moves the selected-row fill class when the mode selection changes', async () => {
    renderForm();
    await openDialog();
    const replaceLabel = screen.getByRole('radio', { name: /Remplacer la définition/ }).closest('label')!;
    const forbidLabel = screen.getByRole('radio', { name: /Interdire cette définition/ }).closest('label')!;
    const replaceBefore = replaceLabel.className;
    const forbidBefore = forbidLabel.className;

    click(screen.getByRole('radio', { name: /Interdire cette définition/ }));

    expect(replaceLabel.className).not.toBe(replaceBefore);
    expect(forbidLabel.className).not.toBe(forbidBefore);
  });

  it('has no axe violations with the picker open', async () => {
    const { expectAxeClean } = await import('@/test/a11y');
    server.use(
      http.get(`${GRID}/v1/words/CHAT/clues`, () =>
        HttpResponse.json({ clues: [{ text: 'Animal qui miaule', theme: null }, { text: 'Matou', theme: 'animaux' }] }),
      ),
    );
    renderForm();
    await openDialog();
    click(screen.getByRole('radio', { name: /Choisir parmi les autres définitions/ }));
    await screen.findByRole('radio', { name: /Matou/ });
    await act(async () => {
      await expectAxeClean(screen.getByRole('dialog'));
    });
  });

  it('has no axe violations when open', async () => {
    const { expectAxeClean } = await import('@/test/a11y');
    renderForm();
    await openDialog();
    await act(async () => {
      await expectAxeClean(screen.getByRole('dialog'));
    });
  });

  it('closes on the browser back gesture (popstate)', async () => {
    renderForm();
    await openDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
