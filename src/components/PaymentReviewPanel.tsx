import type { FormEvent, ReactElement } from 'react';
import {
  RafflePaymentReviewPanel,
  type RafflePaymentReviewCopy,
  type RafflePaymentReviewIntent,
} from './RafflePaymentReviewPanel';

export interface PaymentRecord {
  paymentId: string;
  telegramId: string;
  type: string;
  amount: number | null;
  currency: string;
  status: string;
  occurredAt: string | null;
}

export type PassPaymentSearchBy = 'telegram_id' | 'charge_id';

export interface PassPaymentLookupReceipt {
  paymentId: string;
  telegramId: string;
  product: 'hide_age' | 'invisible';
  amount: number;
  currency: string;
  status: string;
  occurredAt: string | null;
}

export interface PassPaymentLookup {
  telegramId: string | null;
  receipts: PassPaymentLookupReceipt[];
  hasMore: boolean;
  currentAccess: {
    hideAge: {
      enabled: boolean;
      active: boolean;
      expiresAt: string | null;
    };
    invisibility: {
      gridVisible: boolean;
      active: boolean;
      expiresAt: string | null;
    };
  } | null;
}

export interface PaymentReviewCopy {
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
  type: string;
  amount: string;
  status: string;
  date: string;
  passLookupTitle: string;
  passLookupHint: string;
  passLookupPlaceholder: string;
  passLookupByTelegram: string;
  passLookupByCharge: string;
  passLookupProfileMissing: string;
  passLookupReceipts: string;
  passLookupNoReceipts: string;
  passLookupHideAge: string;
  passLookupInvisibility: string;
  passLookupEnabled: string;
  passLookupDisabled: string;
  passLookupActive: string;
  passLookupInactive: string;
  passLookupGridVisible: string;
  passLookupGridHidden: string;
  passLookupExpires: string;
  passLookupNoExpiry: string;
  passLookupMoreReceipts: string;
  paid: string;
  fulfilled: string;
  refunded: string;
  rejected: string;
  pending: string;
  prechecked: string;
  cancelled: string;
  failed: string;
  typeLabels: Record<string, string>;
}

function statusColor(status: string): string {
  if (status === 'paid' || status === 'fulfilled') return '#4ade80';
  if (status === 'refunded' || status === 'rejected' || status === 'cancelled' || status === 'failed') {
    return '#fca5a5';
  }
  return '#facc15';
}

function statusLabel(status: string, copy: PaymentReviewCopy): string {
  const labels: Record<string, string> = {
    paid: copy.paid,
    fulfilled: copy.fulfilled,
    refunded: copy.refunded,
    rejected: copy.rejected,
    pending: copy.pending,
    prechecked: copy.prechecked,
    cancelled: copy.cancelled,
    failed: copy.failed,
  };
  return labels[status] || status.replace(/[_-]+/g, ' ');
}

export function PaymentReviewPanel({
  payments,
  hasMore,
  loading,
  error,
  search,
  passLookup,
  passLookupLoading,
  passLookupError,
  passLookupSearch,
  passLookupSearchBy,
  copy,
  formatDate,
  onSearchChange,
  onSearch,
  onPassLookupSearchChange,
  onPassLookupSearchByChange,
  onPassLookup,
  onRefresh,
  onLoadMore,
  onClose,
  raffleReview,
}: {
  payments: PaymentRecord[];
  hasMore: boolean;
  loading: boolean;
  error: string;
  search: string;
  passLookup: PassPaymentLookup | null;
  passLookupLoading: boolean;
  passLookupError: string;
  passLookupSearch: string;
  passLookupSearchBy: PassPaymentSearchBy;
  copy: PaymentReviewCopy;
  formatDate: (value: string) => string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onPassLookupSearchChange: (value: string) => void;
  onPassLookupSearchByChange: (value: PassPaymentSearchBy) => void;
  onPassLookup: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onClose: () => void;
  raffleReview: {
    intents: RafflePaymentReviewIntent[];
    hasMore: boolean;
    loading: boolean;
    error: string;
    search: string;
    recoveringIntentId: string | null;
    notice: string;
    recoveryError: string;
    copy: RafflePaymentReviewCopy;
    onSearchChange: (value: string) => void;
    onSearch: () => void;
    onRefresh: () => void;
    onLoadMore: () => void;
    onRecover: (intentId: string, action: 'fulfill' | 'refund') => void;
  };
}): ReactElement {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };
  const handlePassLookupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onPassLookup();
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
        aria-labelledby="payment-review-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        style={{
          width: '100%',
          maxWidth: '860px',
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
              id="payment-review-title"
              data-testid="text-payment-review-title"
              style={{ margin: 0, color: '#fff', fontSize: '16px' }}
            >
              {copy.title}
            </h2>
            <p
              data-testid="text-payment-review-privacy"
              style={{ margin: '5px 0 0', color: '#aaa', fontSize: '12px' }}
            >
              {copy.privacy}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            data-testid="button-close-payment-review"
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
            data-testid="input-payment-review-search"
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
            data-testid="button-search-payments"
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
            data-testid="button-refresh-payments"
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
          <section
            aria-labelledby="pass-payment-lookup-title"
            data-testid="section-pass-payment-lookup"
            style={{
              margin: '14px 0',
              padding: '12px',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              background: '#242424',
            }}
          >
            <h3
              id="pass-payment-lookup-title"
              style={{ margin: '0 0 5px', color: '#fff', fontSize: '14px' }}
            >
              {copy.passLookupTitle}
            </h3>
            <p style={{ margin: '0 0 10px', color: '#aaa', fontSize: '12px', lineHeight: 1.4 }}>
              {copy.passLookupHint}
            </p>
            <form
              onSubmit={handlePassLookupSubmit}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
            >
              <select
                value={passLookupSearchBy}
                onChange={(event) =>
                  onPassLookupSearchByChange(event.target.value as PassPaymentSearchBy)
                }
                aria-label={copy.passLookupTitle}
                data-testid="select-pass-payment-lookup-mode"
                style={{
                  minWidth: '130px',
                  padding: '9px 10px',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  background: '#2a2a2a',
                  color: '#fff',
                }}
              >
                <option value="telegram_id">{copy.passLookupByTelegram}</option>
                <option value="charge_id">{copy.passLookupByCharge}</option>
              </select>
              <input
                type="search"
                value={passLookupSearch}
                onChange={(event) => onPassLookupSearchChange(event.target.value)}
                placeholder={copy.passLookupPlaceholder}
                aria-label={copy.passLookupPlaceholder}
                maxLength={128}
                autoComplete="off"
                required
                data-testid="input-pass-payment-lookup"
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
              <button
                type="submit"
                disabled={passLookupLoading}
                data-testid="button-pass-payment-lookup"
                style={{
                  padding: '9px 12px',
                  border: '1px solid #2563eb',
                  borderRadius: '6px',
                  backgroundColor: passLookupLoading ? '#374151' : '#1d4ed8',
                  color: '#fff',
                  cursor: passLookupLoading ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {passLookupLoading ? copy.loading : copy.search}
              </button>
            </form>
            {passLookupLoading && (
              <p role="status" style={{ color: '#aaa', fontSize: '12px' }}>{copy.loading}</p>
            )}
            {passLookupError && (
              <p role="alert" data-testid="alert-pass-payment-lookup" style={{ color: '#fca5a5', fontSize: '12px' }}>
                {passLookupError}
              </p>
            )}
            {passLookup && (
              <div
                aria-live="polite"
                data-testid="pass-payment-lookup-results"
                style={{ marginTop: '12px', color: '#eee', fontSize: '12px' }}
              >
                <p style={{ margin: '0 0 10px' }}>
                  <strong>{copy.telegramId}:</strong> {passLookup.telegramId || '—'}
                </p>
                {!passLookup.currentAccess ? (
                  <p style={{ margin: '0 0 10px', color: '#fca5a5' }}>
                    {copy.passLookupProfileMissing}
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    <div style={{ padding: '9px', border: '1px solid #3f3f46', borderRadius: '6px' }}>
                      <strong>{copy.passLookupHideAge}</strong>
                      <div>
                        {passLookup.currentAccess.hideAge.enabled
                          ? copy.passLookupEnabled
                          : copy.passLookupDisabled}
                        {' · '}
                        {passLookup.currentAccess.hideAge.active
                          ? copy.passLookupActive
                          : copy.passLookupInactive}
                      </div>
                      <div>
                        {copy.passLookupExpires}:{' '}
                        {passLookup.currentAccess.hideAge.expiresAt
                          ? formatDate(passLookup.currentAccess.hideAge.expiresAt)
                          : copy.passLookupNoExpiry}
                      </div>
                    </div>
                    <div style={{ padding: '9px', border: '1px solid #3f3f46', borderRadius: '6px' }}>
                      <strong>{copy.passLookupInvisibility}</strong>
                      <div>
                        {passLookup.currentAccess.invisibility.gridVisible
                          ? copy.passLookupGridVisible
                          : copy.passLookupGridHidden}
                        {' · '}
                        {passLookup.currentAccess.invisibility.active
                          ? copy.passLookupActive
                          : copy.passLookupInactive}
                      </div>
                      <div>
                        {copy.passLookupExpires}:{' '}
                        {passLookup.currentAccess.invisibility.expiresAt
                          ? formatDate(passLookup.currentAccess.invisibility.expiresAt)
                          : copy.passLookupNoExpiry}
                      </div>
                    </div>
                  </div>
                )}
                <h4 style={{ margin: '12px 0 6px' }}>{copy.passLookupReceipts}</h4>
                {passLookup.receipts.length === 0 ? (
                  <p style={{ margin: '0 0 6px', color: '#aaa' }}>{copy.passLookupNoReceipts}</p>
                ) : (
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {passLookup.receipts.map((receipt) => (
                      <div
                        key={receipt.paymentId}
                        data-testid={`row-pass-lookup-${receipt.paymentId}`}
                        style={{
                          padding: '8px',
                          border: '1px solid #3f3f46',
                          borderRadius: '6px',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        <strong style={{ fontFamily: 'monospace' }}>{receipt.paymentId}</strong>
                        <div>
                          {copy.typeLabels[receipt.product] || receipt.product}
                          {' · '}
                          {receipt.currency === 'XTR'
                            ? `${receipt.amount} ⭐`
                            : `${receipt.amount} ${receipt.currency}`}
                          {' · '}
                          {statusLabel(receipt.status, copy)}
                          {' · '}
                          {receipt.occurredAt ? formatDate(receipt.occurredAt) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {passLookup.hasMore && (
                  <p style={{ margin: '7px 0 0', color: '#aaa' }}>{copy.passLookupMoreReceipts}</p>
                )}
              </div>
            )}
          </section>

          <RafflePaymentReviewPanel
            intents={raffleReview.intents}
            hasMore={raffleReview.hasMore}
            loading={raffleReview.loading}
            error={raffleReview.error}
            search={raffleReview.search}
            recoveringIntentId={raffleReview.recoveringIntentId}
            recoveryNotice={raffleReview.notice}
            recoveryError={raffleReview.recoveryError}
            copy={raffleReview.copy}
            common={copy}
            formatDate={formatDate}
            onSearchChange={raffleReview.onSearchChange}
            onSearch={raffleReview.onSearch}
            onRefresh={raffleReview.onRefresh}
            onLoadMore={raffleReview.onLoadMore}
            onRecover={raffleReview.onRecover}
          />

          {loading && (
            <p role="status" data-testid="status-payments-loading" style={{ color: '#aaa', fontSize: '13px' }}>
              {copy.loading}
            </p>
          )}
          {error && (
            <p role="alert" data-testid="alert-payments-error" style={{ color: '#fca5a5', fontSize: '13px' }}>
              {error || copy.loadError}
            </p>
          )}
          {!loading && !error && payments.length === 0 && (
            <p data-testid="text-payments-empty" style={{ color: '#aaa', fontSize: '13px' }}>
              {copy.empty}
            </p>
          )}
          {payments.length > 0 && (
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
                    {[copy.reference, copy.telegramId, copy.type, copy.amount, copy.status, copy.date].map((label) => (
                      <th key={label} scope="col" style={{ padding: '11px 8px', borderBottom: '1px solid #444', whiteSpace: 'nowrap' }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.paymentId} data-testid={`row-payment-${payment.paymentId}`}>
                      <td
                        data-testid={`text-payment-reference-${payment.paymentId}`}
                        style={{ maxWidth: '190px', padding: '10px 8px', borderBottom: '1px solid #333', fontFamily: 'monospace', overflowWrap: 'anywhere' }}
                      >
                        {payment.paymentId}
                      </td>
                      <td
                        data-testid={`text-payment-user-${payment.paymentId}`}
                        style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}
                      >
                        {payment.telegramId}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}>
                        {copy.typeLabels[payment.type] || payment.type.replace(/[_-]+/g, ' ')}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}>
                        {payment.amount === null
                          ? '—'
                          : payment.currency === 'XTR'
                            ? `${payment.amount} ⭐`
                            : `${payment.amount} ${payment.currency}`}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}>
                        <span
                          role="status"
                          data-testid={`status-payment-${payment.paymentId}`}
                          style={{
                            display: 'inline-block',
                            padding: '3px 7px',
                            border: `1px solid ${statusColor(payment.status)}`,
                            borderRadius: '999px',
                            color: statusColor(payment.status),
                          }}
                        >
                          {statusLabel(payment.status, copy)}
                        </span>
                      </td>
                      <td
                        data-testid={`text-payment-date-${payment.paymentId}`}
                        style={{ padding: '10px 8px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}
                      >
                        {payment.occurredAt ? formatDate(payment.occurredAt) : '—'}
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
              data-testid="button-load-more-payments"
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
