import { createElement } from 'react';

const h = createElement;
const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function handleVipGrantNoticeKeyDown(event, onDismiss) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onDismiss();
    return;
  }
  if (event.key !== 'Tab') return;

  const dialog = event.currentTarget;
  const focusable = dialog.querySelectorAll(focusableSelector);
  const first = focusable.item(0);
  const last = focusable.item(focusable.length - 1);
  if (!first || !last) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const activeElement = dialog.ownerDocument?.activeElement ?? null;
  const focusIsOutside = !dialog.contains(activeElement);
  if (event.shiftKey && (activeElement === first || focusIsOutside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeElement === last || focusIsOutside)) {
    event.preventDefault();
    first.focus();
  }
}

export function VipGrantNoticeDialog({
  title,
  body,
  rewards = [],
  profileOffer = null,
  confirmLabel,
  retryLabel = confirmLabel,
  confirmingLabel = confirmLabel,
  confirming = false,
  errorMessage = '',
  onConfirm,
  onDismiss,
  onUseNow,
  onForfeit,
}) {
  const actionLabel = confirming
    ? confirmingLabel
    : errorMessage
      ? retryLabel
      : confirmLabel;
  return h(
    'div',
    {
      role: 'dialog',
      'data-testid': 'reward-congratulations-dialog',
      'aria-modal': true,
      'aria-labelledby': 'vip-grant-notice-title',
      tabIndex: -1,
      onKeyDown: (event) => handleVipGrantNoticeKeyDown(event, onDismiss),
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 3100,
        backgroundColor: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      },
    },
    h(
      'div',
      {
        style: {
          width: '100%',
          maxWidth: '360px',
          padding: '22px',
          backgroundColor: '#1e1e1e',
          border: '1px solid #665500',
          borderRadius: '14px',
          boxShadow: '0 14px 48px rgba(0,0,0,0.75)',
          textAlign: 'center',
        },
      },
      h('div', { 'aria-hidden': true, style: { fontSize: '36px', marginBottom: '8px' } }, '⭐'),
      h(
        'h2',
        {
          id: 'vip-grant-notice-title',
          style: { margin: '0 0 10px', color: '#f5c518', fontSize: '19px' },
        },
        title,
      ),
      h(
        'p',
        {
          style: { margin: '0 0 20px', color: '#eee', fontSize: '14px', lineHeight: 1.5 },
        },
        body,
      ),
      rewards.length > 0 && h(
        'ul',
        {
          'aria-label': title,
          style: {
            margin: '0 0 20px',
            padding: '0 0 0 20px',
            color: '#fff',
            textAlign: 'left',
            fontSize: '14px',
            lineHeight: 1.6,
          },
        },
        rewards.map((reward, index) =>
          h('li', { key: `${index}-${reward}`, style: { marginBottom: '4px' } }, reward)),
      ),
      errorMessage && h(
        'p',
        {
          role: 'alert',
          style: { margin: '0 0 14px', color: '#ffb4b4', fontSize: '14px', lineHeight: 1.45 },
        },
        errorMessage,
      ),
      profileOffer
        ? h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '9px' } },
            h('button', {
              type: 'button',
              autoFocus: true,
              disabled: confirming,
              'aria-busy': confirming,
              onClick: onUseNow,
              'data-testid': 'profile-update-offer-use-now',
              style: {
                width: '100%',
                minHeight: '44px',
                padding: '11px 14px',
                border: 0,
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: confirming ? 'wait' : 'pointer',
              },
            }, profileOffer.useNowLabel),
            h('button', {
              type: 'button',
              disabled: confirming,
              'aria-busy': confirming,
              onClick: onForfeit,
              'data-testid': 'profile-update-offer-forfeit',
              style: {
                width: '100%',
                minHeight: '44px',
                padding: '11px 14px',
                border: '1px solid #4b5563',
                borderRadius: '8px',
                backgroundColor: '#2a2a2a',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: confirming ? 'wait' : 'pointer',
              },
            }, profileOffer.forfeitLabel),
          )
        : h(
        'button',
        {
          type: 'button',
          autoFocus: true,
          disabled: confirming,
          'aria-busy': confirming,
          onClick: onConfirm,
          style: {
            width: '100%',
            padding: '11px 14px',
            border: 0,
            borderRadius: '8px',
            backgroundColor: '#d4a900',
            color: '#171717',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: confirming ? 'wait' : 'pointer',
          },
        },
        actionLabel,
      ),
    ),
  );
}
