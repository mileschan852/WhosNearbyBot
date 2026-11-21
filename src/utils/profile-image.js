export function hasUploadedMainProfileImage(avatar) {
  if (typeof avatar !== 'string' || !avatar.trim()) return false;

  try {
    const imageUrl = new URL(avatar.trim());
    return imageUrl.protocol === 'https:' &&
      Boolean(imageUrl.hostname) &&
      /\.jpe?g$/i.test(imageUrl.pathname);
  } catch {
    return false;
  }
}

export function hasJpgMainProfileImage(avatar) {
  if (typeof avatar !== 'string' || !avatar.trim()) return false;

  try {
    const imageUrl = new URL(avatar.trim());
    return imageUrl.protocol === 'https:' &&
      Boolean(imageUrl.hostname) &&
      /\.jpg$/i.test(imageUrl.pathname);
  } catch {
    return false;
  }
}
