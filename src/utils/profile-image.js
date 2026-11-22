export function hasUploadedMainProfileImage(avatar) {
  if (typeof avatar !== 'string' || !avatar.trim()) return false;

  try {
    // The Worker sets this value from Telegram's validated user.photo_url.
    // Telegram CDN URLs are not guaranteed to include a file extension.
    const imageUrl = new URL(avatar.trim());
    return imageUrl.protocol === 'https:' &&
      Boolean(imageUrl.hostname);
  } catch {
    return false;
  }
}
