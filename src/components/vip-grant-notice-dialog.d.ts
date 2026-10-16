import type { ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface VipGrantNoticeDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  retryLabel?: string;
  confirmingLabel?: string;
  confirming?: boolean;
  errorMessage?: string;
  onConfirm: () => unknown;
  onDismiss: () => void;
}

export function handleVipGrantNoticeKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  onDismiss: () => void,
): void;

export function VipGrantNoticeDialog(props: VipGrantNoticeDialogProps): ReactElement;
