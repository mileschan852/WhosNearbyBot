import type { ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface VipGrantNoticeDialogProps {
  title: string;
  body: string;
  rewards?: string[];
  profileOffer?: {
    useNowLabel: string;
    forfeitLabel: string;
  } | null;
  confirmLabel: string;
  retryLabel?: string;
  confirmingLabel?: string;
  confirming?: boolean;
  errorMessage?: string;
  onConfirm: () => unknown;
  onDismiss: () => void;
  onUseNow?: () => unknown;
  onForfeit?: () => unknown;
}

export function handleVipGrantNoticeKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  onDismiss: () => void,
): void;

export function VipGrantNoticeDialog(props: VipGrantNoticeDialogProps): ReactElement;
