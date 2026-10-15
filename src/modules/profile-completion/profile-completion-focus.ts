export function focusFirstIncompleteProfileField(
  form: Pick<HTMLFormElement, 'querySelector'> | null,
): boolean {
  const firstIncompleteField = form?.querySelector<HTMLElement>(
    '[data-profile-incomplete-editable="true"]:not(:disabled)',
  );
  if (!firstIncompleteField) return false;
  firstIncompleteField.focus();
  return true;
}
