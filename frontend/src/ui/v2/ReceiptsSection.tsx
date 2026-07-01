import { useEffect, useState } from 'react';
import { css, cx } from 'styled-system/css';
import type { BillingClient, Receipt } from '@/application/billing';
import { useBillingGate } from './useBillingGate';

const groupLabel = css({ fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#543C00', margin: '0 6px 7px' });
const cardWrap = css({ bg: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)' });

const list = css({ listStyle: 'none', margin: 0, padding: 0 });
const row = css({ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 15px', borderTop: '1px solid #EEF3EC', _first: { borderTop: 'none' } });
const rowMain = css({ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' });
const dateText = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.jadeInk' });
const amountText = css({ flex: 'none', fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '15px', color: 'ws.jadeInk' });

const pill = css({ display: 'inline-flex', alignItems: 'center', lineHeight: 1, fontFamily: 'wsUi', fontSize: '9.5px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: '999px', padding: '4px 8px' });
const pillPaid = css({ color: 'ws.clueSurface', bg: 'ws.jade' });
const pillPending = css({ color: '#5A4B12', bg: 'ws.or' });
const pillAlert = css({ color: 'ws.sakuraDark', bg: 'rgba(190,73,112,0.12)' });
const pillMuted = css({ color: 'ws.khaki', bg: 'rgba(33,75,64,0.08)' });

const divider = css({ height: '1px', bg: '#EEF3EC' });
const moreBtn = css({ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '48px', padding: '12px 15px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk', _hover: { bg: 'ws.sable' }, _disabled: { opacity: 0.6, cursor: 'default' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' } });
const loadingRow = css({ padding: '16px 15px', fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.85 });
const messagePad = css({ padding: '16px 15px' });
const note = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.khaki', opacity: 0.9, lineHeight: '1.4', margin: 0 });
const inlineError = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', lineHeight: '1.4', margin: 0 });

const STATUS_LABEL: Record<string, string> = {
  paid: 'Payé',
  pending: 'En attente',
  failed: 'Échoué',
  refunded: 'Remboursé',
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function statusPillClass(status: string): string {
  if (status === 'paid') return cx(pill, pillPaid);
  if (status === 'pending') return cx(pill, pillPending);
  if (status === 'failed') return cx(pill, pillAlert);
  return cx(pill, pillMuted);
}

function receiptDateFr(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

function amountFr(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(minorUnits / 100);
}

type LoadState = 'loading' | 'loaded' | 'error';

function ReceiptsPanel({ client }: { readonly client: BillingClient }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    client
      .listReceipts()
      .then((page) => {
        if (cancelled) return;
        setReceipts(page.receipts);
        setNextCursor(page.nextCursor);
        setState('loaded');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [client]);

  async function loadMore() {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await client.listReceipts(nextCursor);
      setReceipts((prev) => [...prev, ...page.receipts]);
      setNextCursor(page.nextCursor);
    } catch {
      // A failed "voir plus" keeps the rows already shown; the cursor stays so a retry is possible.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <nav aria-label="Mes reçus">
      <div className={groupLabel}>Mes reçus</div>
      <div className={cardWrap}>
        {state === 'loading' ? (
          <div className={loadingRow} role="status" aria-busy="true">
            Chargement de tes reçus…
          </div>
        ) : state === 'error' ? (
          <div className={messagePad}>
            <p className={inlineError} role="status">
              Impossible de charger tes reçus pour le moment.
            </p>
          </div>
        ) : receipts.length === 0 ? (
          <div className={messagePad}>
            <p className={note}>Aucun reçu pour le moment.</p>
          </div>
        ) : (
          <>
            <ul className={list}>
              {receipts.map((receipt) => (
                <li key={receipt.paidAt} className={row}>
                  <span className={rowMain}>
                    <span className={dateText}>{receiptDateFr(receipt.paidAt)}</span>
                  </span>
                  <span className={amountText}>{amountFr(receipt.amountMinorUnits, receipt.currency)}</span>
                  <span className={statusPillClass(receipt.status)}>{statusLabel(receipt.status)}</span>
                </li>
              ))}
            </ul>
            {nextCursor !== null ? (
              <>
                <div className={divider} />
                <button type="button" className={moreBtn} onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Chargement…' : 'Voir plus'}
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </nav>
  );
}

// "Mes reçus" payment history; gated like the abonnement surfaces (cosmetic — server enforces, ADR-0078).
export function ReceiptsSection({ client }: { readonly client: BillingClient }) {
  const gate = useBillingGate();
  if (gate !== 'allowed') return null;
  return <ReceiptsPanel client={client} />;
}
