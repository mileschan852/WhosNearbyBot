import type { FormEvent, ReactElement } from 'react';

export interface RafflePaymentRecoveryEvent {
  action: 'fulfill' | 'refund';
  status: string;
  outcome: string | null;
  createdAt: string | null;
}

export interface RafflePaymentReviewIntent {
  intentId: string;
  telegramId: string;
  bot: 'botA' | 'botB';
  status: string;
  updatedAt: string | null;
  ticketIssued: boolean;
  canRetryFulfillment: boolean;
  canRefund: boolean;
  recoveryHistory: RafflePaymentRecoveryEvent[];
}

export interface RafflePaymentReviewCopy {
  title: string;
  hint: string;
  searchPlaceholder: string;
  empty: string;
  issued: string;
  missing: string;
  fulfill: string;
  refund: string;
  confirmRefund: string;
  history: string;
  noHistory: string;
  actionLabel: Record<'fulfill' | 'refund', string>;
  statusLabels: Record<string, string>;
}

export function RafflePaymentReviewPanel({
  intents,
  hasMore,
  loading,
  error,
  search,
  recoveringIntentId,
  recoveryNotice,
  recoveryError,
  copy,
  common,
  formatDate,
  onSearchChange,
  onSearch,
  onRefresh,
  onLoadMore,
  onRecover,
}: {
  intents: RafflePaymentReviewIntent[];
  hasMore: boolean;
  loading: boolean;
  error: string;
  search: string;
  recoveringIntentId: string | null;
  recoveryNotice: string;
  recoveryError: string;
  copy: RafflePaymentReviewCopy;
  common: {
    search: string;
    refresh: string;
    loading: string;
    loadMore: string;
    telegramId: string;
    status: string;
    date: string;
    close: string;
  };
  formatDate: (value: string) => string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRecover: (intentId: string, action: 'fulfill' | 'refund') => void;
}): ReactElement {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <section
      aria-labelledby="raffle-payment-recovery-title"
      data-testid="section-raffle-payment-recovery"
      style={{
        margin: '14px 0',
        padding: '12px',
        border: '1px solid #4b4230',
        borderRadius: '8px',
        background: '#242424',
      }}
    >
      <h3
        id="raffle-payment-recovery-title"
        style={{ margin: '0 0 5px', color: '#fff', fontSize: '14px' }}
      >
        {copy.title}
      </h3>
      <p style={{ margin: '0 0 10px', color: '#aaa', fontSize: '12px', lineHeight: 1.4 }}>
        {copy.hint}
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
      >
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchPlaceholder}
          maxLength={128}
          autoComplete="off"
          data-testid="input-raffle-payment-search"
          style={{
            minWidth: '140px',
            flex: '1 1 180px',
            padding: '9px 10px',
            border: '1px solid #444',
            borderRadius: '6px',
            background: '#2a2a2a',
            color: '#fff',
            fontSize: '13px',
          }}
        />
        <button type="submit" disabled={loading} data-testid="button-search-raffle-payments">
          {common.search}
        </button>
        <button type="button" onClick={onRefresh} disabled={loading} data-testid="button-refresh-raffle-payments">
          {common.refresh}
        </button>
      </form>

      {loading && (
        <p role="status" data-testid="status-raffle-payments-loading" style={{ color: '#aaa', fontSize: '12px' }}>
          {common.loading}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="alert-raffle-payments-error" style={{ color: '#fca5a5', fontSize: '12px' }}>
          {error}
        </p>
      )}
      {recoveryNotice && (
        <p role="status" aria-live="polite" data-testid="status-raffle-recovery-notice" style={{ color: '#fde68a', fontSize: '12px' }}>
          {recoveryNotice}
        </p>
      )}
      {recoveryError && (
        <p role="alert" data-testid="alert-raffle-recovery-action" style={{ color: '#fca5a5', fontSize: '12px' }}>
          {recoveryError}
        </p>
      )}
      {!loading && !error && intents.length === 0 && (
        <p data-testid="text-raffle-payments-empty" style={{ color: '#aaa', fontSize: '12px' }}>
          {copy.empty}
        </p>
      )}

      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
        {intents.map((intent) => {
          const busy = recoveringIntentId === intent.intentId;
          return (
            <article
              key={intent.intentId}
              data-testid={`row-raffle-payment-${intent.intentId}`}
              style={{
                padding: '10px',
                border: '1px solid #3f3f46',
                borderRadius: '7px',
                color: '#eee',
                fontSize: '12px',
                overflowWrap: 'anywhere',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
                <span><strong>{common.telegramId}:</strong> {intent.telegramId}</span>
                <span><strong>Bot:</strong> {intent.bot === 'botA' ? 'HKMO Date' : "Who's Nearby"}</span>
                <span><strong>{common.status}:</strong> {copy.statusLabels[intent.status] || intent.status}</span>
                <span>
                  <strong>{common.date}:</strong>{' '}
                  {intent.updatedAt ? formatDate(intent.updatedAt) : '—'}
                </span>
                <span>{intent.ticketIssued ? copy.issued : copy.missing}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '8px' }}>
                {intent.canRetryFulfillment && (
                  <button
                    type="button"
                    disabled={recoveringIntentId !== null}
                    onClick={() => onRecover(intent.intentId, 'fulfill')}
                    data-testid={`button-fulfill-raffle-${intent.intentId}`}
                  >
                    {busy ? common.loading : copy.fulfill}
                  </button>
                )}
                {intent.canRefund && (
                  <button
                    type="button"
                    disabled={recoveringIntentId !== null}
                    onClick={() => {
                      if (window.confirm(copy.confirmRefund)) onRecover(intent.intentId, 'refund');
                    }}
                    data-testid={`button-refund-raffle-${intent.intentId}`}
                  >
                    {busy ? common.loading : copy.refund}
                  </button>
                )}
              </div>
              {intent.recoveryHistory.length > 0 && (
                <details style={{ marginTop: '8px' }}>
                  <summary style={{ cursor: 'pointer' }}>{copy.history}</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#c4c4c4' }}>
                    {intent.recoveryHistory.map((event, index) => (
                      <li key={`${event.createdAt || 'unknown'}-${event.action}-${index}`}>
                        {copy.actionLabel[event.action]} · {copy.statusLabels[event.status] || event.status}
                        {event.createdAt ? ` · ${formatDate(event.createdAt)}` : ''}
                        {event.outcome ? ` — ${event.outcome}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {intent.recoveryHistory.length === 0 && (
                <p style={{ margin: '7px 0 0', color: '#888' }}>{copy.noHistory}</p>
              )}
            </article>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          data-testid="button-load-more-raffle-payments"
          style={{ display: 'block', margin: '10px auto 0' }}
        >
          {common.loadMore}
        </button>
      )}
    </section>
  );
}
