import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
            language_code?: string;
          };
          start_param?: string;
        };
        ready?: () => void;
        expand?: () => void;
        openTelegramLink?: (url: string) => void;
        showAlert?: (message: string) => void;
        openInvoice?: (url: string, callback?: (status: string) => void) => void;
      };
    };
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Localization Dictionary
type LangKey = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';

const translations: Record<LangKey, Record<string, string>> = {
  'en': {
    loading: 'Loading app...',
    locationRequired: 'Location Access Required',
    locationMessage: "Location permission is mandatory to use Who's Nearby. Please enable location access in your browser or Telegram settings and restart the app.",
    accessDenied: 'Access Denied',
    underageMessage: 'The app is for adults only. Access has been locked for this account due to age restrictions.',
    completeProfile: 'Complete Your Profile',
    profileWarning: 'Warning: This cannot be changed in the future. Information entered here affects who you can see and interact with.',
    dob: 'Date of Birth:',
    imA: "I'm a",
    seeking: 'seeking',
    man: 'man',
    woman: 'woman',
    nonBinary: 'non-binary',
    men: 'men',
    women: 'women',
    everyone: 'everyone',
    height: 'Height:',
    selectHeight: 'Select height',
    weight: 'Weight:',
    selectWeight: 'Select weight',
    tapToChange: 'tap to change your preference:',
    mode: 'Mode:',
    browsingOnly: 'Browsing only - You cannot send not receive private message from others',
    onlineOnly: 'Online only - You are visible on grid but not on map, map is inaccessible',
    meetUp: 'Meet up - You are visible on grid and map',
    saveProfile: 'Save Profile & Continue',
    whosNearby: "Who's Nearby",
    filter: 'Filter',
    refresh: 'Refresh',
    grid: 'Grid',
    map: 'Map',
    filterUsers: 'Filter Users',
    ageRange: 'Age Range',
    rolePreference: 'Role Preference',
    safetyPreference: 'Safety Preference',
    playstylePreference: 'Playstyle Preference',
    groupSize: 'Group Size',
    applyFilters: 'Apply Filters',
    ageHidden: 'Age Hidden (Click to Show)',
    ageShown: 'Age Shown (Click to Hide)',
    expires: 'Expires:',
    sendMessage: 'Send Message',
    unlockPreference: 'Change Profile & Preferences',
    iGotStuff: 'I got stuff',
    unlockPreferencePrompt: 'Changing your profile/preferences requires a one-time payment of 1000 Telegram Stars. Proceed to payment?',
    invisiblePrompt: 'Going invisible requires a 30-day subscription for 3000 Telegram Stars. Proceed to payment?',
    hideAgePrompt: 'Hiding age requires a 30-day subscription for 1000 Telegram Stars. Proceed to payment?',
    paymentCancelled: 'Payment cancelled or failed.',
    errorSaving: 'Error saving profile:',
    fillAll: 'Please fill out all required questions to continue.',
  },
  'zh-CN': {
    loading: '正在加载应用...',
    locationRequired: '需要位置权限',
    locationMessage: '使用“附近”功能必须获得位置权限。请在浏览器或 Telegram 设置中启用位置访问并重新启动应用。',
    accessDenied: '拒绝访问',
    underageMessage: '本应用仅限成年人使用。由于年龄限制，该账户已被锁定。',
    completeProfile: '完善您的个人资料',
    profileWarning: '警告：此信息将来无法更改。此处填写的内容会影响您可以看到和互动的用户。',
    dob: '出生日期：',
    imA: '我是',
    seeking: '寻找',
    man: '男性',
    woman: '女性',
    nonBinary: '非二元性别',
    men: '男性',
    women: '女性',
    everyone: '所有人',
    height: '身高：',
    selectHeight: '选择身高',
    weight: '体重：',
    selectWeight: '选择体重',
    tapToChange: '点击更改您的偏好：',
    mode: '模式：',
    browsingOnly: '仅浏览 - 您无法发送和接收来自他人的私信',
    onlineOnly: '仅在线 - 您在网格上可见但在地图上不可见，地图不可用',
    meetUp: '约会中 - 您在网格和地图上均可见',
    saveProfile: '保存资料并继续',
    whosNearby: '附近的人',
    filter: '筛选',
    refresh: '刷新',
    grid: '网格',
    map: '地图',
    filterUsers: '筛选用户',
    ageRange: '年龄范围',
    rolePreference: '角色偏好',
    safetyPreference: '安全偏好',
    playstylePreference: '游戏风格偏好',
    groupSize: '群组人数',
    applyFilters: '应用筛选',
    ageHidden: '年龄已隐藏（点击显示）',
    ageShown: '年龄已显示（点击隐藏）',
    expires: '到期时间：',
    sendMessage: '发送消息',
    unlockPreference: '更改资料与偏好',
    iGotStuff: '我有货',
    unlockPreferencePrompt: '更改个人资料与偏好需要支付 1000 Telegram Stars。是否继续支付？',
    invisiblePrompt: '隐身需要订阅 30 天，费用为 3000 Telegram Stars。是否继续支付？',
    hideAgePrompt: '隐藏年龄需要订阅 30 天，费用为 1000 Telegram Stars。是否继续支付？',
    paymentCancelled: '支付已取消或失败。',
    errorSaving: '保存资料出错：',
    fillAll: '请填写所有必填问题以继续。',
  },
  'zh-TW': {
    loading: '正在載入應用程式...',
    locationRequired: '需要位置權限',
    locationMessage: '使用「附近」功能必須獲得位置權限。請在瀏覽器或 Telegram 設定中啟用位置存取並重新啟動應用程式。',
    accessDenied: '存取被拒',
    underageMessage: '本應用程式僅限成年人使用。由於年齡限制，該帳戶已被鎖定。',
    completeProfile: '完善您的個人資料',
    profileWarning: '警告：此資訊未來無法更改。此處填寫的內容會影響您可以看到和互動的使用者。',
    dob: '出生日期：',
    imA: '我是',
    seeking: '尋找',
    man: '男性',
    woman: '女性',
    nonBinary: '非二元性別',
    men: '男性',
    women: '女性',
    everyone: '所有人',
    height: '身高：',
    selectHeight: '選擇身高',
    weight: '體重：',
    selectWeight: '選擇體重',
    tapToChange: '點擊更改您的偏好：',
    mode: '模式：',
    browsingOnly: '僅瀏覽 - 您無法發送和接收來自他人的私訊',
    onlineOnly: '僅線上 - 您在網格上可見但在地圖上不可見，地圖不可用',
    meetUp: '見面中 - 您在網格和地圖上均可見',
    saveProfile: '儲存資料並繼續',
    whosNearby: '附近的人',
    filter: '篩選',
    refresh: '重新整理',
    grid: '網格',
    map: '地圖',
    filterUsers: '篩選使用者',
    ageRange: '年齡範圍',
    rolePreference: '角色偏好',
    safetyPreference: '安全偏好',
    playstylePreference: '風格偏好',
    groupSize: '群組人數',
    applyFilters: '套用篩選',
    ageHidden: '年齡已隱藏（點擊顯示）',
    ageShown: '年齡已顯示（點擊隱藏）',
    expires: '到期時間：',
    sendMessage: '傳送訊息',
    unlockPreference: '更改資料與偏好',
    iGotStuff: '我有貨',
    unlockPreferencePrompt: '更改個人資料與偏好需要支付 1000 Telegram Stars。是否繼續支付？',
    invisiblePrompt: '隱身需要訂閱 30 天，費用為 3000 Telegram Stars。是否繼續支付？',
    hideAgePrompt: '隱藏年齡需要訂閱 30 天，費用為 1000 Telegram Stars。是否繼續支付？',
    paymentCancelled: '付款已取消或失敗。',
    errorSaving: '儲存資料出錯：',
    fillAll: '請填寫所有必填問題以繼續。',
  },
  'ja': {
    loading: 'アプリを読み込んでいます...',
    locationRequired: '位置情報のアクセスが必要です',
    locationMessage: '「近くの人」機能を使用するには位置情報の許可が必須です。ブラウザまたはTelegramの設定で位置情報のアクセスを有効にして、アプリを再起動してください。',
    accessDenied: 'アクセスが拒否されました',
    underageMessage: 'このアプリは成人向けです。年齢制限によりこのアカウントへのアクセスがロックされました。',
    completeProfile: 'プロフィールを完成させる',
    profileWarning: '警告：これは後から変更できません。ここで入力した情報は、表示ややり取りできる相手に影響します。',
    dob: '生年月日：',
    imA: '私は',
    seeking: '探しています：',
    man: '男性',
    woman: '女性',
    nonBinary: 'ノンバイナリー',
    men: '男性',
    women: '女性',
    everyone: 'すべての人',
    height: '身長：',
    selectHeight: '身長を選択',
    weight: '体重：',
    selectWeight: '体重を選択',
    tapToChange: 'タップして好みを変更：',
    mode: 'モード：',
    browsingOnly: '閲覧のみ - 他の人からのプライベートメッセージの送受信ができません',
    onlineOnly: 'オンラインのみ - グリッドには表示されますがマップには表示されず、マップは利用できません',
    meetUp: 'ミートアップ - グリッドとマップの両方に表示されます',
    saveProfile: 'プロフィールを保存して続ける',
    whosNearby: '近くの人',
    filter: 'フィルター',
    refresh: '更新',
    grid: 'グリッド',
    map: 'マップ',
    filterUsers: 'ユーザーをフィルター',
    ageRange: '年齢層',
    rolePreference: 'ロールの好み',
    safetyPreference: '安全の好み',
    playstylePreference: 'プレイスタイルの好み',
    groupSize: 'グループサイズ',
    applyFilters: 'フィルターを適用',
    ageHidden: '年齢非表示（クリックして表示）',
    ageShown: '年齢表示（クリックして非表示）',
    expires: '有効期限：',
    sendMessage: 'メッセージを送る',
    unlockPreference: 'プロフィールと好みを変更',
    iGotStuff: '持ってるよ',
    unlockPreferencePrompt: 'プロフィールと好みの変更には1000 Telegram Starsの支払いが必要です。支払いに進みますか？',
    invisiblePrompt: '透明化には30日間のサブスクリプション（3000 Telegram Stars）が必要です。支払いに進みますか？',
    hideAgePrompt: '年齢非表示には30日間のサブスクリプション（1000 Telegram Stars）が必要です。支払いに進みますか？',
    paymentCancelled: '支払いがキャンセルされたか、失敗しました。',
    errorSaving: 'プロフィールの保存エラー：',
    fillAll: '続けるにはすべての必須項目を入力してください。',
  },
  'ko': {
    loading: '앱 로딩 중...',
    locationRequired: '위치 접근 권한 필요',
    locationMessage: '주변 사용자 기능을 사용하려면 위치 권한이 필수입니다. 브라우저나 Telegram 설정에서 위치 접근을 활성화한 후 앱을 다시 시작해 주세요.',
    accessDenied: '접근 거부됨',
    underageMessage: '이 앱은 성인 전용입니다. 연령 제한으로 인해 이 계정의 접근이 잠겼습니다.',
    completeProfile: '프로필 완성하기',
    profileWarning: '경고: 이는 나중에 변경할 수 없습니다. 여기에 입력한 정보는 볼 수 있는 사용자와 상호작용에 영향을 줍니다.',
    dob: '생년월일:',
    imA: '나는',
    seeking: '찾는 대상:',
    man: '남성',
    woman: '여성',
    nonBinary: '논바이너리',
    men: '남성',
    women: '여성',
    everyone: '모두',
    height: '키:',
    selectHeight: '키 선택',
    weight: '체중:',
    selectWeight: '체중 선택',
    tapToChange: '탭하여 선호도 변경:',
    mode: '모드:',
    browsingOnly: '브라우징 전용 - 다른 사람의 비공개 메시지를 보내거나 받을 수 없습니다',
    onlineOnly: '온라인 전용 - 그리드에는 표시되지만 지도에는 표시되지 않으며 지도는 사용할 수 없습니다',
    meetUp: '만남 - 그리드와 지도 모두에 표시됩니다',
    saveProfile: '프로필 저장 및 계속',
    whosNearby: '내 주변',
    filter: '필터',
    refresh: '새로고침',
    grid: '그리드',
    map: '지도',
    filterUsers: '사용자 필터',
    ageRange: '연령대',
    rolePreference: '포지션 선호',
    safetyPreference: '안전 선호',
    playstylePreference: '플레이스타일 선호',
    groupSize: '그룹 인원',
    applyFilters: '필터 적용',
    ageHidden: '나이 숨김 (클릭하여 표시)',
    ageShown: '나이 표시 (클릭하여 숨김)',
    expires: '만료일:',
    sendMessage: '메시지 보내기',
    unlockPreference: '프로필 및 선호도 변경',
    iGotStuff: '나 있음',
    unlockPreferencePrompt: '프로필 및 선호도를 변경하려면 1000 Telegram Stars 결제가 필요합니다. 결제를 진행하시겠습니까?',
    invisiblePrompt: '숨김 모드는 30일 구독(3000 Telegram Stars)이 필요합니다. 결제를 진행하시겠습니까?',
    hideAgePrompt: '나이 숨기기는 30일 구독(1000 Telegram Stars)이 필요합니다. 결제를 진행하시겠습니까?',
    paymentCancelled: '결제가 취소되었거나 실패했습니다.',
    errorSaving: '프로필 저장 오류:',
    fillAll: '계속하려면 모든 필수 항목을 입력해주세요.',
  },
  'ru': {
    loading: 'Загрузка приложения...',
    locationRequired: 'Требуется доступ к геолокации',
    locationMessage: 'Разрешение на геолокацию обязательно для использования функции «Рядом». Включите геолокацию в настройках браузера или Telegram и перезапустите приложение.',
    accessDenied: 'Доступ запрещен',
    underageMessage: 'Приложение только для взрослых. Доступ для этой учетной записи заблокирован из-за возрастных ограничений.',
    completeProfile: 'Заполните профиль',
    profileWarning: 'Предупреждение: это нельзя будет изменить в будущем. Указанная здесь информация влияет на то, кого вы видите и с кем взаимодействуете.',
    dob: 'Дата рождения:',
    imA: 'Я',
    seeking: 'ищу',
    man: 'мужчину',
    woman: 'женщину',
    nonBinary: 'небинарную персону',
    men: 'мужчин',
    women: 'женщин',
    everyone: 'всех',
    height: 'Рост:',
    selectHeight: 'Выберите рост',
    weight: 'Вес:',
    selectWeight: 'Выберите вес',
    tapToChange: 'нажмите, чтобы изменить предпочтение:',
    mode: 'Режим:',
    browsingOnly: 'Только просмотр - вы не можете отправлять и получать личные сообщения от других',
    onlineOnly: 'Только онлайн - вы видны в сетке, но не на карте, карта недоступна',
    meetUp: 'Встреча - вы видны в сетке и на карте',
    saveProfile: 'Сохранить профиль и продолжить',
    whosNearby: 'Рядом',
    filter: 'Фильтр',
    refresh: 'Обновить',
    grid: 'Сетка',
    map: 'Карта',
    filterUsers: 'Фильтровать пользователей',
    ageRange: 'Возрастной диапазон',
    rolePreference: 'Роль',
    safetyPreference: 'Безопасность',
    playstylePreference: 'Стиль',
    groupSize: 'Размер группы',
    applyFilters: 'Применить фильтры',
    ageHidden: 'Возраст скрыт (Нажмите, чтобы показать)',
    ageShown: 'Возраст виден (Нажмите, чтобы скрыть)',
    expires: 'И истекает:',
    sendMessage: 'Отправить сообщение',
    unlockPreference: 'Изменить профиль и предпочтения',
    iGotStuff: 'У меня есть стафф',
    unlockPreferencePrompt: 'Изменение профиля и предпочтений требует разового платежа в размере 1000 Telegram Stars. Перейти к оплате?',
    invisiblePrompt: 'Переход в режим невидимки требует подписки на 30 дней за 3000 Telegram Stars. Перейти к оплате?',
    hideAgePrompt: 'Сокрытие возраста требует подписки на 30 дней за 1000 Telegram Stars. Перейти к оплате?',
    paymentCancelled: 'Оплата отменена или не удалась.',
    errorSaving: 'Ошибка сохранения профиля:',
    fillAll: 'Пожалуйста, заполните все обязательные поля для продолжения.',
  }
};

interface UserProfile {
  id: string;
  name: string;
  username?: string;
  avatar: string;
  lat: number | null;
  lng: number | null;
  last_seen: string | null;
  gender?: string | null;
  seeking?: string | null;
  dob?: string | null;
  height?: string | null;
  weight?: string | null;
  role_pref?: string | null;
  safety_pref?: string | null;
  playstyle_pref?: string | null;
  where_pref?: string | null;
  how_many_pref?: string | null;
  non_man_mode?: string | null;
  is_underage?: boolean;
  hide_age?: boolean;
  grid_visible?: boolean;
  map_visible?: boolean;
  distance?: number;
  hide_age_expiry?: string | null;
  invisible_expiry?: string | null;
  filter_sub_expiry?: string | null;
  preference_unlocked?: boolean;
}

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  try {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  } catch {
    return 0;
  }
};

const formatDistanceBigUnit = (meters?: number) => {
  if (meters === undefined || meters === null) return '0m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${meters}m`;
};

const calculateAge = (dobString?: string | null) => {
  if (!dobString) return null;
  try {
    const birthDate = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
};

const getZodiacSignEmoji = (dobString?: string | null) => {
  if (!dobString) return '';
  try {
    const date = new Date(dobString);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '♈';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '♉';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return '♊';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return '♋';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '♌';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '♍';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '♎';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '♏';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return '♐';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '♑';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '♒';
    return '♓';
  } catch {
    return '';
  }
};

const formatLastSeenBigUnit = (isoString?: string | null) => {
  if (!isoString) return 'Offline';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Online';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return 'Offline';
  }
};

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.invalidateSize();
      map.setView(center, 15, { animate: true });
    }
  }, [center, map]);
  return null;
}

const createProfileIcon = (user: UserProfile, isEnabled: boolean, isSelf: boolean) => {
  let innerHtml = '';
  if (user.avatar) {
    innerHtml = `<img src="${user.avatar}" style="width: 100%; height: 100%; object-fit: cover;" />`;
  } else {
    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    innerHtml = `<div style="width: 100%; height: 100%; background-color: #0088cc; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">${initial}</div>`;
  }

  const opacity = isEnabled ? '1' : '0.3';
  const filter = isEnabled ? 'none' : 'grayscale(100%)';
  const borderColor = isSelf ? '#00ffff' : (isEnabled ? '#007bff' : '#555');

  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 3px solid ${borderColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.6); background-color: #222; opacity: ${opacity}; filter: ${filter}; display: flex; align-items: center; justify-content: center;">${innerHtml}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

export default function App() {
  const [lang, setLang] = useState<LangKey>('en');
  const t = (key: string) => translations[lang]?.[key] || translations['en'][key] || key;

  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 22.3193, lng: 114.1694 });
  const [isReady, setIsReady] = useState<boolean>(false);
  const [showProfileSetup, setShowProfileSetup] = useState<boolean>(false);
  const [isUnderageLocked, setIsUnderageLocked] = useState<boolean>(false);
  const [isLocationDenied, setIsLocationDenied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showStuffBubble, setShowStuffBubble] = useState<boolean>(false);

  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [showProfileEditModal, setShowProfileEditModal] = useState<boolean>(false);

  // Form input states (Default to seeking women for normal users)
  const [dob, setDob] = useState<string>('');
  const [gender, setGender] = useState<string>('man');
  const [seeking, setSeeking] = useState<string>('women');
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  
  // 5 Preferences Tags
  const [rolePref, setRolePref] = useState<string>('Versatile');
  const [safetyPref, setSafetyPref] = useState<string>('Safe');
  const [playstylePref, setPlaystylePref] = useState<string>('Clean');
  const [howManyPref, setHowManyPref] = useState<string>('1on1');
  const [wherePref, setWherePref] = useState<string>('Host');

  const [nonManMode, setNonManMode] = useState<string>('Meet up - You are visible on grid and map');

  const [hideAge, setHideAge] = useState<boolean>(false);
  const [hideAgeExpiry, setHideAgeExpiry] = useState<string | null>(null);
  const [invisibleExpiry, setInvisibleExpiry] = useState<string | null>(null);
  const [filterSubExpiry, setFilterSubExpiry] = useState<string | null>(null);
  const [preferenceUnlocked, setPreferenceUnlocked] = useState<boolean>(false);
  const [gridVisible, setGridVisible] = useState<boolean>(true);
  const [mapVisible, setMapVisible] = useState<boolean>(false);

  // Filter States
  const [filterAgeEnabled, setFilterAgeEnabled] = useState<boolean>(false);
  const [filterAgeMin, setFilterAgeMin] = useState<number>(0);
  const [filterAgeMax, setFilterAgeMax] = useState<number>(99);

  const [filterRoleEnabled, setFilterRoleEnabled] = useState<boolean>(true);
  const [filterRoleVal, setFilterRoleVal] = useState<string>('Bottom');

  const [filterSafetyEnabled, setFilterSafetyEnabled] = useState<boolean>(true);
  const [filterSafetyVal, setFilterSafetyVal] = useState<string>('Safe');

  const [filterPlaystyleEnabled, setFilterPlaystyleEnabled] = useState<boolean>(true);
  const [filterPlaystyleVal, setFilterPlaystyleVal] = useState<string>('Clean');

  const [filterHowManyEnabled, setFilterHowManyEnabled] = useState<boolean>(true);
  const [filterHowManyVal, setFilterHowManyVal] = useState<string>('1on1');

  const roleCycleOptions = ['Versatile', 'Top', 'Bottom', 'Side'];
  const safetyCycleOptions = ['Safe', 'Raw'];
  const playstyleCycleOptions = ['Clean', 'Party', 'Party✓'];
  const howManyCycleOptions = ['1on1', 'Group'];
  const whereCycleOptions = ['Host', 'Travel'];

  const cycleNext = (current: string, options: string[]) => {
    const idx = options.indexOf(current);
    if (idx === -1 || idx === options.length - 1) return options[0];
    return options[idx + 1];
  };

  const heightOptions = [];
  for (let i = 10; i <= 30; i++) {
    const m = (i / 10).toFixed(1);
    const cm = i * 10;
    const totalInches = Math.round(cm / 2.54);
    const ft = Math.floor(totalInches / 12);
    const inch = totalInches % 12;
    heightOptions.push(`${m}m (${ft}ft ${inch}in)`);
  }

  const weightOptions = [];
  for (let kg = 35; kg <= 160; kg += 1) {
    const lbs = Math.round(kg * 2.20462);
    weightOptions.push(`${kg}kg (${lbs}lbs)`);
  }

  const fetchUsersData = async (lat: number, lng: number, currentUserId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from('profiles').select('*');
    if (!error && data && Array.isArray(data)) {
      const processed = data.map((u: any) => ({
        id: u.id || 'unknown',
        name: u.name || 'User',
        username: u.username || '',
        avatar: u.avatar || '',
        lat: typeof u.lat === 'number' ? u.lat : lat,
        lng: typeof u.lng === 'number' ? u.lng : lng,
        last_seen: u.last_seen || new Date().toISOString(),
        gender: u.gender || null,
        seeking: u.seeking || null,
        dob: u.dob || null,
        height: u.height || null,
        weight: u.weight || null,
        role_pref: u.role_pref || null,
        safety_pref: u.safety_pref || null,
        playstyle_pref: u.playstyle_pref || null,
        where_pref: u.where_pref || null,
        how_many_pref: u.how_many_pref || null,
        non_man_mode: u.non_man_mode || null,
        is_underage: u.is_underage || false,
        hide_age: u.hide_age || false,
        grid_visible: u.grid_visible ?? true,
        map_visible: u.map_visible ?? false,
        distance: calculateDistance(lat, lng, u.lat || lat, u.lng || lng),
        hide_age_expiry: u.hide_age_expiry || null,
        invisible_expiry: u.invisible_expiry || null,
        filter_sub_expiry: u.filter_sub_expiry || null,
        preference_unlocked: u.preference_unlocked || false,
      })).filter((u) => u.id === currentUserId || u.grid_visible !== false)
        .sort((a, b) => (a.distance || 0) - (b.distance || 0));
      
      setUsers(processed);
    }
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.ready?.();
          window.Telegram.WebApp.expand?.();
        }

        let tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        let startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';

        if (!tgUser) {
          await new Promise((res) => setTimeout(res, 300));
          tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
          startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || startParam;
        }

        // Language detection
        const tgLangCode = (tgUser?.language_code || navigator.language || 'en').toLowerCase();
        if (tgLangCode.startsWith('zh')) {
          if (tgLangCode.includes('tw') || tgLangCode.includes('hk') || tgLangCode.includes('hant')) {
            setLang('zh-TW');
          } else {
            setLang('zh-CN');
          }
        } else if (tgLangCode.startsWith('ja')) {
          setLang('ja');
        } else if (tgLangCode.startsWith('ko')) {
          setLang('ko');
        } else if (tgLangCode.startsWith('ru')) {
          setLang('ru');
        } else {
          setLang('en');
        }

        const username = tgUser?.username || '';
        setIsAdmin(false);

        const savedUserId = localStorage.getItem('whos_nearby_user_id');
        const userId = tgUser?.id ? `tg_${tgUser.id}` : (savedUserId || 'user_' + Math.random().toString(36).substring(2, 9));
        if (!tgUser?.id && !savedUserId) {
          localStorage.setItem('whos_nearby_user_id', userId);
        }

        const userName = tgUser?.first_name || (tgUser?.id ? `User ${tgUser.id}` : 'Test User');
        const userUsername = tgUser?.username || '';
        const userAvatar = tgUser?.photo_url || '';

        if (!navigator.geolocation) {
          setIsLocationDenied(true);
          setIsReady(true);
          return;
        }

        const hasLocation = await new Promise<boolean>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              resolve(true);
            },
            () => {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                  resolve(true);
                },
                () => resolve(false),
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
              );
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        });

        if (!hasLocation) {
          setLocation({ lat: 22.3193, lng: 114.1694 }); // Fallback default coordinates to prevent blocking
        }

        let existingProfile: any = null;
        if (supabase) {
          const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
          if (data) {
            existingProfile = data;
          }
        }

        if (existingProfile?.is_underage) {
          setIsUnderageLocked(true);
          setIsReady(true);
          return;
        }

        let initialGender = 'man';
        let initialSeeking = 'women';

        if (startParam === 'hkmod') {
          initialGender = 'man';
          initialSeeking = 'men';
        } else if (existingProfile) {
          if (existingProfile.gender) initialGender = existingProfile.gender;
          if (existingProfile.seeking) initialSeeking = existingProfile.seeking;
        }

        setGender(initialGender);
        setSeeking(initialSeeking);

        const isManSeekingMan = initialGender === 'man' && initialSeeking === 'men';
        const isFullySetup = existingProfile && 
          existingProfile.dob && 
          existingProfile.gender && 
          existingProfile.seeking && 
          existingProfile.height && 
          existingProfile.weight && 
          (!isManSeekingMan || (existingProfile.role_pref && existingProfile.safety_pref && existingProfile.playstyle_pref && existingProfile.how_many_pref && existingProfile.where_pref)) &&
          (isManSeekingMan || existingProfile.non_man_mode);

        if (existingProfile) {
          if (existingProfile.dob) setDob(existingProfile.dob);
          if (existingProfile.height) setHeight(existingProfile.height);
          if (existingProfile.weight) setWeight(existingProfile.weight);
          if (existingProfile.role_pref) setRolePref(existingProfile.role_pref);
          if (existingProfile.safety_pref) setSafetyPref(existingProfile.safety_pref);
          if (existingProfile.playstyle_pref) setPlaystylePref(existingProfile.playstyle_pref);
          if (existingProfile.how_many_pref) setHowManyPref(existingProfile.how_many_pref);
          if (existingProfile.where_pref) setWherePref(existingProfile.where_pref);
          if (existingProfile.non_man_mode) setNonManMode(existingProfile.non_man_mode);

          if (typeof existingProfile.hide_age === 'boolean') setHideAge(existingProfile.hide_age);
          if (existingProfile.hide_age_expiry) setHideAgeExpiry(existingProfile.hide_age_expiry);
          if (existingProfile.invisible_expiry) setInvisibleExpiry(existingProfile.invisible_expiry);
          if (existingProfile.filter_sub_expiry) setFilterSubExpiry(existingProfile.filter_sub_expiry);
          if (typeof existingProfile.preference_unlocked === 'boolean') setPreferenceUnlocked(existingProfile.preference_unlocked);
          if (typeof existingProfile.grid_visible === 'boolean') setGridVisible(existingProfile.grid_visible);
          if (typeof existingProfile.map_visible === 'boolean') setMapVisible(existingProfile.map_visible);

          if (isManSeekingMan) {
            if (existingProfile.role_pref) setFilterRoleVal(existingProfile.role_pref);
            if (existingProfile.safety_pref) setFilterSafetyVal(existingProfile.safety_pref);
            if (existingProfile.playstyle_pref) setFilterPlaystyleVal(existingProfile.playstyle_pref);
            if (existingProfile.how_many_pref) setFilterHowManyVal(existingProfile.how_many_pref);
          }
        }

        const currentLoc = location;
        if (!isFullySetup) {
          setShowProfileSetup(true);
          const blankProfile: UserProfile = {
            id: userId,
            name: userName,
            username: userUsername,
            avatar: userAvatar,
            lat: null,
            lng: null,
            last_seen: null,
            gender: initialGender,
            seeking: initialSeeking,
            dob: null,
            height: null,
            weight: null,
            role_pref: null,
            safety_pref: null,
            playstyle_pref: null,
            where_pref: null,
            how_many_pref: null,
            non_man_mode: null,
            is_underage: false,
            hide_age: false,
            grid_visible: true,
            map_visible: false,
            hide_age_expiry: null,
            invisible_expiry: null,
            filter_sub_expiry: null,
            preference_unlocked: false,
          };
          setCurrentUser(blankProfile);
        } else {
          const myProfile: UserProfile = {
            id: userId,
            name: userName,
            username: userUsername,
            avatar: userAvatar,
            lat: currentLoc.lat,
            lng: currentLoc.lng,
            last_seen: new Date().toISOString(),
            gender: initialGender,
            seeking: initialSeeking,
            dob: existingProfile.dob,
            height: existingProfile.height,
            weight: existingProfile.weight,
            role_pref: isManSeekingMan ? existingProfile.role_pref : null,
            safety_pref: isManSeekingMan ? existingProfile.safety_pref : null,
            playstyle_pref: isManSeekingMan ? existingProfile.playstyle_pref : null,
            where_pref: isManSeekingMan ? existingProfile.where_pref : null,
            how_many_pref: isManSeekingMan ? existingProfile.how_many_pref : null,
            non_man_mode: isManSeekingMan ? null : existingProfile.non_man_mode,
            is_underage: false,
            hide_age: existingProfile.hide_age || false,
            grid_visible: existingProfile.grid_visible ?? true,
            map_visible: existingProfile.map_visible ?? false,
            hide_age_expiry: existingProfile.hide_age_expiry || null,
            invisible_expiry: existingProfile.invisible_expiry || null,
            filter_sub_expiry: existingProfile.filter_sub_expiry || null,
            preference_unlocked: existingProfile.preference_unlocked || false,
          };
          setCurrentUser(myProfile);
          if (supabase) {
            await fetchUsersData(currentLoc.lat, currentLoc.lng, userId);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsReady(true);
      }
    };

    initApp();
  }, []);

  const handleRefresh = async () => {
    if (!currentUser || !currentUser.lat || !currentUser.lng || !supabase) return;
    const lastRefreshKey = `last_refresh_${currentUser.id}`;
    const lastRefreshTime = Number(localStorage.getItem(lastRefreshKey) || 0);
    const now = Date.now();

    if (now - lastRefreshTime < 5 * 60 * 1000) {
      return;
    }

    localStorage.setItem(lastRefreshKey, now.toString());
    await fetchUsersData(currentUser.lat, currentUser.lng, currentUser.id);
  };

  const handleSaveInitialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const isManSeekingMan = gender === 'man' && seeking === 'men';

    if (!dob || !gender || !seeking || !height || !weight || (isManSeekingMan && (!rolePref || !safetyPref || !playstylePref || !howManyPref || !wherePref)) || (!isManSeekingMan && !nonManMode)) {
      setErrorMessage(t('fillAll'));
      return;
    }

    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      if (currentUser && supabase) {
        const underageProfile = { ...currentUser, dob, is_underage: true };
        await supabase.from('profiles').upsert([underageProfile], { onConflict: 'id' });
      }
      setIsUnderageLocked(true);
      return;
    }

    if (!currentUser || !supabase) return;

    const updatedProfile = {
      ...currentUser,
      lat: location.lat,
      lng: location.lng,
      last_seen: new Date().toISOString(),
      dob,
      gender,
      seeking,
      height,
      weight,
      role_pref: isManSeekingMan ? rolePref : null,
      safety_pref: isManSeekingMan ? safetyPref : null,
      playstyle_pref: isManSeekingMan ? playstylePref : null,
      how_many_pref: isManSeekingMan ? howManyPref : null,
      where_pref: isManSeekingMan ? wherePref : null,
      non_man_mode: isManSeekingMan ? null : nonManMode,
      hide_age: false,
      is_underage: false,
    };

    const { error } = await supabase.from('profiles').upsert([updatedProfile], { onConflict: 'id' });
    if (error) {
      setErrorMessage(`${t('errorSaving')} ${error.message}`);
      return;
    }

    if (isManSeekingMan) {
      if (rolePref) {
        setFilterRoleEnabled(true);
        setFilterRoleVal(rolePref);
      }
      if (safetyPref) {
        setFilterSafetyEnabled(true);
        setFilterSafetyVal(safetyPref);
      }
      if (playstylePref) {
        setFilterPlaystyleEnabled(true);
        setFilterPlaystyleVal(playstylePref);
      }
      if (howManyPref) {
        setFilterHowManyEnabled(true);
        setFilterHowManyVal(howManyPref);
      }
    }

    setCurrentUser(updatedProfile);
    setShowProfileSetup(false);
    setShowProfileEditModal(false);
    await fetchUsersData(location.lat, location.lng, currentUser.id);
  };

  const handleOpenProfileEdit = async () => {
    if (!currentUser || !supabase) return;

    if (isAdmin) {
      setShowProfileEditModal(true);
      return;
    }

    const confirmed = window.confirm(t('unlockPreferencePrompt'));
    if (!confirmed) return;

    if (window.Telegram?.WebApp?.openInvoice) {
      window.Telegram.WebApp.openInvoice("https://t.me/$INVOICE_LINK_PLACEHOLDER", async (status) => {
        if (status === 'paid') {
          setShowProfileEditModal(true);
        } else {
          alert(t('paymentCancelled'));
        }
      });
      return;
    } else {
      setShowProfileEditModal(true);
    }
  };

  const handleToggleGrid = async () => {
    if (!currentUser || !supabase) return;
    
    let nextVal = !gridVisible;
    let newInvisibleExpiry = invisibleExpiry;

    if (!nextVal && !isAdmin) {
      const now = new Date();
      const isExpired = !invisibleExpiry || new Date(invisibleExpiry).getTime() < now.getTime();
      
      if (isExpired) {
        const confirmed = window.confirm(t('invisiblePrompt'));
        if (!confirmed) return;

        if (window.Telegram?.WebApp?.openInvoice) {
          window.Telegram.WebApp.openInvoice("https://t.me/$INVOICE_LINK_PLACEHOLDER", async (status) => {
            if (status === 'paid') {
              const expiryDate = new Date();
              expiryDate.setDate(expiryDate.getDate() + 30);
              newInvisibleExpiry = expiryDate.toISOString();
              setInvisibleExpiry(newInvisibleExpiry);
              
              setGridVisible(false);
              const updated = { ...currentUser, grid_visible: false, invisible_expiry: newInvisibleExpiry };
              setCurrentUser(updated);
              await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
              setView('grid');
              await handleRefresh();
            } else {
              alert(t('paymentCancelled'));
            }
          });
          return;
        } else {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          newInvisibleExpiry = expiryDate.toISOString();
          setInvisibleExpiry(newInvisibleExpiry);
        }
      }
    }

    setGridVisible(nextVal);
    const updated = { ...currentUser, grid_visible: nextVal, invisible_expiry: newInvisibleExpiry };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
    setView('grid');
    await handleRefresh();
  };

  const handleToggleMap = async () => {
    if (!currentUser || !supabase) return;
    const nextVal = !mapVisible;
    setMapVisible(nextVal);
    const updated = { ...currentUser, map_visible: nextVal };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
    
    if (nextVal) {
      setView('map');
    } else {
      setView('grid');
    }
    
    if (currentUser.lat && currentUser.lng) {
      await fetchUsersData(currentUser.lat, currentUser.lng, currentUser.id);
    }
  };

  const handleUpdateSelfField = async (fields: Partial<UserProfile>) => {
    if (!currentUser || !supabase) return;
    const updated = { ...currentUser, ...fields };
    setCurrentUser(updated);
    await supabase.from('profiles').upsert([updated], { onConflict: 'id' });
  };

  const handleHideAgeToggle = async () => {
    
  const handleHideAgeToggle = async () => {
    if (!currentUser || !supabase) return;

    let nextHide = !hideAge;
    let newExpiry = hideAgeExpiry;

    if (nextHide && !isAdmin) {
      const now = new Date();
      const isExpired = !hideAgeExpiry || new Date(hideAgeExpiry).getTime() < now.getTime();

      if (isExpired) {
        const confirmed = window.confirm(t('hideAgePrompt'));
        if (!confirmed) return;

        if (window.Telegram?.WebApp?.openInvoice) {
          window.Telegram.WebApp.openInvoice("https://t.me/$INVOICE_LINK_PLACEHOLDER", async (status) => {
            if (status === 'paid') {
              const expiryDate = new Date();
              expiryDate.setDate(expiryDate.getDate() + 30);
              newExpiry = expiryDate.toISOString();
              setHideAgeExpiry(newExpiry);
              setHideAge(true);
              await handleUpdateSelfField({ hide_age: true, hide_age_expiry: newExpiry });
            } else {
              alert(t('paymentCancelled'));
            }
          });
          return;
        } else {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          newExpiry = expiryDate.toISOString();
          setHideAgeExpiry(newExpiry);
        }
      }
    } else if (!nextHide) {
      newExpiry = null;
      setHideAgeExpiry(null);
    }

  const handleHideAgeToggle = async () => {
    if (!currentUser || !supabase) return;

    let nextHide = !hideAge;
    let newExpiry = hideAgeExpiry;

    if (nextHide && !isAdmin) {
      const now = new Date();
      const isExpired = !hideAgeExpiry || new Date(hideAgeExpiry).getTime() < now.getTime();

      if (isExpired) {
        const confirmed = window.confirm(t('hideAgePrompt'));
        if (!confirmed) return;

        if (window.Telegram?.WebApp?.openInvoice) {
          window.Telegram.WebApp.openInvoice("https://t.me/$INVOICE_LINK_PLACEHOLDER", async (status) => {
            if (status === 'paid') {
              const expiryDate = new Date();
              expiryDate.setDate(expiryDate.getDate() + 30);
              newExpiry = expiryDate.toISOString();
              setHideAgeExpiry(newExpiry);
              setHideAge(true);
              await handleUpdateSelfField({ hide_age: true, hide_age_expiry: newExpiry });
            } else {
              alert(t('paymentCancelled'));
            }
          });
          return;
        } else {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          newExpiry = expiryDate.toISOString();
          setHideAgeExpiry(newExpiry);
        }
      }
    } else if (!nextHide) {
      newExpiry = null;
      setHideAgeExpiry(null);
    }

    setHideAge(nextHide);
    await handleUpdateSelfField({ hide_age: nextHide, hide_age_expiry: newExpiry });
  };

  const handleCardClick = (targetUser: UserProfile) => {
    setSelectedProfile(targetUser);
  };