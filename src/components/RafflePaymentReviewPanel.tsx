import type { FormEvent, ReactElement } from 'react';

export interface RafflePaymentIntent {
  intentId: string;
  telegramId: string;
  bot: 'botA' | 'botB';
  status: string;
  updatedAt: string | null;
}

export interface RafflePaymentReviewCopy {
  title: string;
  privacy: string;
  searchPlaceholder: string;
  search: string;
  refresh: string;
  loading: string;
  loadError: string;
  empty: string;
  loadMore: string;
  close: string;
  reference: string;
  telegramId: string;
  app: string;
  status: string;
  updated: string;
  fulfilled: string;
  refunded: string;
  rejected: string;
  pending: string;
  prechecked: string;
  cancelled: string;
}

function statusColor(status: string): string {
  if (status === 'fulfilled') return '#4ade80';
  if (status === 'refunded' || status === 'rejected' || status === 'cancelled') return '#fca5a5';
  return '#facc15';
}

function statusLabel(status: string, copy: RafflePaymentReviewCopy): string {
  const labels: Record<string, string> = {
    fulfilled: copy.fulfilled,
    refunded: copy.refunded,
    rejected: copy.rejected,
    pending: copy.pending,
    prechecked: copy.prechecked,
    cancelled: copy.cancelled,
  };
  return labels[status] || status.replace(/[_-]+/g, ' ');
}

export function RafflePaymentReviewPanel({
  intents,
  hasMore,
  loading,
  error,
  search,
  copy,
  appLabels,
  formatDate,
  onSearchChange,
  onSearch,
  onRefresh,
  onLoadMore,
  onClose,
}: {
  intents: RafflePaymentIntent[];
  hasMore: boolean;
  loading: boolean;
  error: string;
  search: string;
  copy: RafflePaymentReviewCopy;
  appLabels: Record<'botA' | 'botB', string>;
  formatDate: (value: string) => string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onClose: () => void;
}): ReactElement {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px',
        backgroundColor: 'rgba(0,0,0,0.76)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="raffle-payment-review-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: '#1e1e1e',
          border: '1px solid #444',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '14px 16px',
            borderBottom: '1px solid #333',
          }}
        >
          <div>
            <h2
              id="raffle-payment-review-title"
              data-testid="text-raffle-payment-review-title"
              style={{ margin: 0, color: '#fff', fontSize: '16px' }}
            >
              {copy.title}
            </h2>
            <p
              data-testid="text-raffle-payment-review-privacy"
              style={{ margin: '5px 0 0', color: '#aaa', fontSize: '12px' }}
            >
              {copy.privacy}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            data-testid="button-close-raffle-payment-review"
            style={{
              flex: '0 0 auto',
              padding: '4px 8px',
              border: 0,
              background: 'transparent',
              color: '#aaa',
              fontSize: '22px',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 16px',
            borderBottom: '1px solid #333',
          }}
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
              minWidth: 0,
              flex: 1,
              padding: '9px 10px',
              border: '1px solid #444',
              borderRadius: '6px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              fontSize: '13px',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            data-testid="button-search-raffle-payments"
            style={{
              padding: '9px 12px',
              border: '1px solid #2563eb',
              borderRadius: '6px',
              backgroundColor: loading ? '#374151' : '#1d4ed8',
              color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {copy.search}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            data-testid="button-refresh-raffle-payments"
            style={{
              padding: '9px 12px',
              border: '1px solid #555',
              borderRadius: '6px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {copy.refresh}
          </button>
        </form>

        <div style={{ minHeight: '120px', overflow: 'auto', padding: '0 16px 16px' }}>
          {loading && (
            <p role="status" data-testid="status-raffle-payments-loading" style={{ color: '#aaa', fontSize: '13px' }}>
              {copy.loading}
            </p>
          )}
          {error && (
            <p role="alert" data-testid="alert-raffle-payments-error" style={{ color: '#fca5a5', fontSize: '13px' }}>
              {error || copy.loadError}
            </p>
          )}
          {!loading && !error && intents.length === 0 && (
            <p data-testid="text-raffle-payments-empty" style={{ color: '#aaa', fontSize: '13px' }}>
              {copy.empty}
            </p>
          )}
          {intents.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  color: '#eee',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr style={{ color: '#aaa' }}>
                    {[copy.reference, copy.telegramId, copy.app, copy.status, copy.updated].map((label) => (
                      <th key={label} scope="col" style={{ padding: '11px 8px', borderBottom: '1px solid #444', whiteSpace: 'nowrap' }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {intents.map((intent) => (
                    <tr key={intent.intentId} data-testid={`row-raffle-payment-${intent.intentId}`}>
                      <td
                        data-testid={`text-raffle-payment-reference-${intent.intentId}`}
                        style={{ maxWidth: '210px', padding: '10px 8px', borderBottom: '1px solid #333', fontFamily: 'monospace', overflowWrap: 'anywhere' }}
                      >
                        {intent.intentId}
                      </td>
                      <td
                        data-testid={`text-raffle-payment-user-${intent.intentId}`}
                        style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}
                      >
                        {intent.telegramId}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}>
                        {appLabels[intent.bot]}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}>
                        <span
                          role="status"
                          data-testid={`status-raffle-payment-${intent.intentId}`}
                          style={{
                            display: 'inline-block',
                            padding: '3px 7px',
                            border: `1px solid ${statusColor(intent.status)}`,
                            borderRadius: '999px',
                            color: statusColor(intent.status),
                          }}
                        >
                          {statusLabel(intent.status, copy)}
                        </span>
                      </td>
                      <td
                        data-testid={`text-raffle-payment-updated-${intent.intentId}`}
                        style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}
                      >
                        {intent.updatedAt ? formatDate(intent.updatedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              data-testid="button-load-more-raffle-payments"
              style={{
                display: 'block',
                margin: '12px auto 0',
                padding: '8px 14px',
                border: '1px solid #555',
                borderRadius: '6px',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {copy.loadMore}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
