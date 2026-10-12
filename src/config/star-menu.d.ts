export interface StarMenuItemConfig {
  id: string;
  label: string;
  icon: string;
  url: string;
}

export const DEFAULT_STAR_MENU_ITEMS: readonly StarMenuItemConfig[];
export function parseStarMenuItems(value: unknown, entryId?: string): StarMenuItemConfig[];
