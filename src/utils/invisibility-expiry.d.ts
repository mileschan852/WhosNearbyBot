export function isInvisibilityExpired(
  gridVisible: boolean | null | undefined,
  invisibleExpiry: string | null | undefined,
  now?: number,
): boolean;

export function resolveGridVisibility(
  gridVisible: boolean | null | undefined,
  invisibleExpiry: string | null | undefined,
  now?: number,
): boolean;
