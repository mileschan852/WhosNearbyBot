// Inside App.tsx initialization:
const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
const userName = tgUser?.first_name || 'User';
const tgUsername = tgUser?.username || ''; // Capture Telegram username

const myProfile = {
  id: userId,
  name: userName,
  username: tgUsername, // Saved to Supabase
  avatar: userAvatar,
  lat,
  lng,
  last_seen: new Date().toISOString(),
};

// ...

const handleStartChat = (targetUser: UserProfile) => {
  if (currentUser && targetUser.id === currentUser.id) return;

  if (targetUser.username) {
    // 1. Direct 1-on-1 chat via official Telegram handle
    const chatUrl = `https://t.me/${targetUser.username}`;
    window.Telegram?.WebApp?.openTelegramLink
      ? window.Telegram.WebApp.openTelegramLink(chatUrl)
      : window.open(chatUrl, '_blank');
  } else {
    // 2. Fallback via Bot start link for users without a public username
    const botUsername = 'WhosNearbyBot'; // Replace with your bot handle
    const botUrl = `https://t.me/${botUsername}?start=connect_${targetUser.id.replace('tg_', '')}`;
    window.Telegram?.WebApp?.openTelegramLink
      ? window.Telegram.WebApp.openTelegramLink(botUrl)
      : window.open(botUrl, '_blank');
  }
};
