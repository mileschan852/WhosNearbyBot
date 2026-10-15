/**
 * @param {string} savedHeight
 */
export function buildProfileHeightOptions(savedHeight) {
  const options = [];
  for (let cm = 152; cm <= 300; cm += 1) {
    const totalInches = Math.round(cm / 2.54);
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches % 12;
    options.push(`${cm}cm (${ft}ft ${inch}in)`);
  }
  if (savedHeight && !options.includes(savedHeight)) options.unshift(savedHeight);
  return options;
}

export function buildProfileWeightOptions() {
  const options = [];
  for (let kg = 35; kg <= 160; kg += 1) {
    const lbs = Math.round(kg * 2.20462);
    options.push(`${kg}kg (${lbs}lbs)`);
  }
  return options;
}

export const PROFILE_ROLE_CYCLE_OPTIONS = Object.freeze([
  'Versatile',
  'Top',
  'Bottom',
  'Side',
]);
export const PROFILE_SAFETY_CYCLE_OPTIONS = Object.freeze(['Safe', 'Raw']);
export const PROFILE_PLAYSTYLE_CYCLE_OPTIONS = Object.freeze(['Clean', 'Party']);
export const PROFILE_HOW_MANY_CYCLE_OPTIONS = Object.freeze([
  '1on1',
  'group',
  'DoesntMatter',
]);
export const PROFILE_WHERE_CYCLE_OPTIONS = Object.freeze(['Host', 'Travel', null]);
