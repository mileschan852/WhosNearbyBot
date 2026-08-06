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
  const handleStartChat = (targetUser: UserProfile) => {
    if (targetUser.username) {
      const chatUrl = `https://t.me/${targetUser.username}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(chatUrl);
      } else {
        window.open(chatUrl, '_blank');
      }
    } else if (targetUser.id.startsWith('tg_')) {
      const rawTgId = targetUser.id.replace('tg_', '');
      const profileUrl = `https://t.me/user?id=${rawTgId}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(profileUrl);
      } else {
        window.open(profileUrl, '_blank');
      }
    } else {
      alert(`Selected user: ${targetUser.name}`);
    }
    setSelectedProfile(null);
  };

  const checkFilterPass = (user: UserProfile) => {
    if (currentUser && user.id === currentUser.id) return true;

    if (filterAgeEnabled) {
      const uAge = calculateAge(user.dob);
      if (uAge !== null) {
        if (uAge < filterAgeMin || uAge > filterAgeMax) return false;
      }
    }

    const userIsManSeekingMan = user.gender === 'man' && user.seeking === 'men';
    if (userIsManSeekingMan) {
      if (filterRoleEnabled && filterRoleVal) {
        if (user.role_pref !== filterRoleVal) return false;
      }
      if (filterSafetyEnabled && filterSafetyVal) {
        if (user.safety_pref !== filterSafetyVal) return false;
      }
      if (filterPlaystyleEnabled && filterPlaystyleVal) {
        if (user.playstyle_pref !== filterPlaystyleVal) return false;
      }
      if (filterHowManyEnabled && filterHowManyVal) {
        if (user.how_many_pref !== filterHowManyVal) return false;
      }
    }

    return true;
  };

  if (!isReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <p>{t('loading')}</p>
      </div>
    );
  }

  if (isLocationDenied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ff4d4d', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{t('locationRequired')}</h2>
        <p style={{ fontSize: '16px', color: '#ffffff', maxWidth: '360px', lineHeight: '1.5' }}>
          {t('locationMessage')}
        </p>
      </div>
    );
  }

  if (isUnderageLocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ff4d4d', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{t('accessDenied')}</h2>
        <p style={{ fontSize: '16px', color: '#ffffff', maxWidth: '360px', lineHeight: '1.5' }}>
          {t('underageMessage')}
        </p>
      </div>
    );
  }

  const isViewingSelf = selectedProfile ? (currentUser && selectedProfile.id === currentUser.id) : false;
  const activeProfile = selectedProfile;

  const gridFilteredUsers = users.filter((u) => u.id === currentUser?.id || u.grid_visible !== false);
  const mapFilteredUsers = users.filter((u) => (u.id === currentUser?.id ? mapVisible : (u.map_visible === true && u.grid_visible !== false)));
  const isManSeekingManInput = gender === 'man' && seeking === 'men';
  const targetIsManSeekingMan = activeProfile?.gender === 'man' && activeProfile?.seeking === 'men';
  const isHkModEntry = window.Telegram?.WebApp?.initDataUnsafe?.start_param === 'hkmod';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* INITIAL SETUP FULLSCREEN OVERLAY (FITS ENTIRE SCREEN WITHOUT SCROLLING) */}
      {(showProfileSetup || showProfileEditModal) && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#121212', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '12px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#1e1e1e', borderRadius: '12px', padding: '16px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', border: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
            
            {showProfileEditModal && (
              <button 
                onClick={() => setShowProfileEditModal(false)}
                style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: 'transparent', border: 'none', color: '#aaa', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}

            <h2 style={{ fontSize: '18px', margin: 0, color: '#007bff', textAlign: 'center' }}>{t('completeProfile')}</h2>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#ff4d4d', textAlign: 'center', margin: 0, lineHeight: '1.4' }}>
              {t('profileWarning')}
            </p>

            {errorMessage && (
              <div style={{ backgroundColor: 'rgba(255, 77, 77, 0.25)', border: '1px solid #ff4d4d', color: '#ff4d4d', padding: '6px', borderRadius: '4px', fontSize: '11px', textAlign: 'center' }}>
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSaveInitialProfile} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('dob')}</label>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} style={{ padding: '6px 8px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px', colorScheme: 'dark' }} required />
              </div>

              {/* Orientation Selection with equal width selectors */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', width: '100%' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{t('imA')}</span>
                  <select 
                    value={gender} 
                    onChange={(e) => setGender(e.target.value)} 
                    disabled={isHkModEntry}
                    style={{ flex: 1, minWidth: 0, padding: '6px 4px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px' }}
                  >
                    <option value="man">{t('man')}</option>
                    <option value="woman">{t('woman')}</option>
                    <option value="non-binary">{t('nonBinary')}</option>
                  </select>
                  <span style={{ whiteSpace: 'nowrap' }}>{t('seeking')}</span>
                  <select 
                    value={seeking} 
                    onChange={(e) => setSeeking(e.target.value)} 
                    disabled={isHkModEntry}
                    style={{ flex: 1, minWidth: 0, padding: '6px 4px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px' }}
                  >
                    <option value="men">{t('men')}</option>
                    <option value="women">{t('women')}</option>
                    <option value="everyone">{t('everyone')}</option>
                  </select>
                </div>
              </div>

              {/* Height and weight above dividing line */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('height')}</label>
                  <select value={height} onChange={(e) => setHeight(e.target.value)} style={{ padding: '6px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px' }} required>
                    <option value="" disabled>{t('selectHeight')}</option>
                    {heightOptions.map((h, idx) => (<option key={idx} value={h}>{h}</option>))}
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('weight')}</label>
                  <select value={weight} onChange={(e) => setWeight(e.target.value)} style={{ padding: '6px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px' }} required>
                    <option value="" disabled>{t('selectWeight')}</option>
                    {weightOptions.map((w, idx) => (<option key={idx} value={w}>{w}</option>))}
                  </select>
                </div>
              </div>

              {/* DIVIDING LINE */}
              <div style={{ width: '100%', borderTop: '1px solid #444', margin: '4px 0' }} />

              {/* Only visible if user chose man seeking men */}
              {isManSeekingManInput ? (
                <>
                  <div style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', textAlign: 'center' }}>
                    {t('tapToChange')}
                  </div>

                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                    <button type="button" onClick={() => setRolePref(cycleNext(rolePref, roleCycleOptions))} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#e11d48', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>
                      {rolePref}
                    </button>
                    <button type="button" onClick={() => setSafetyPref(cycleNext(safetyPref, safetyCycleOptions))} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>
                      {safetyPref}
                    </button>
                    <button type="button" onClick={() => setPlaystylePref(cycleNext(playstylePref, ['Party', 'Party✓']))} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>
                      {playstylePref === 'Clean' ? 'Party' : playstylePref}
                    </button>
                    <button type="button" onClick={() => setHowManyPref(cycleNext(howManyPref, howManyCycleOptions))} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#9333ea', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>
                      {howManyPref}
                    </button>
                    <button type="button" onClick={() => setWherePref(cycleNext(wherePref, whereCycleOptions))} style={{ flex: 1, padding: '10px 2px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}>
                      {wherePref}
                    </button>
                  </div>
                </>
              ) : (
                /* Non-man seeking man mode selection below dividing line with smaller font */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#38bdf8' }}>{t('mode')}</label>
                  <select value={nonManMode} onChange={(e) => setNonManMode(e.target.value)} style={{ padding: '6px', backgroundColor: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '10px' }} required>
                    <option value="Browsing only - You cannot send not receive private message from others">{t('browsingOnly')}</option>
                    <option value="Online only - You are visible on grid but not on map, map is inaccessible">{t('onlineOnly')}</option>
                    <option value="Meet up - You are visible on grid and map">{t('meetUp')}</option>
                  </select>
                </div>
              )}

              <button type="submit" style={{ marginTop: '4px', padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>
                {t('saveProfile')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>{t('whosNearby')} ({gridFilteredUsers.length})</h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={handleOpenProfileEdit} 
            style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={t('unlockPreference')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </button>

          <button onClick={handleRefresh} style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('refresh')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
          </button>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: view === 'grid' ? 'block' : 'none', height: '100%', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '4px' }}>
            {gridFilteredUsers.map((user, index) => {
              const isSelf = currentUser && user.id === currentUser.id;
              const passesFilter = checkFilterPass(user);
              const opacity = passesFilter ? 1 : 0.3;
              const filterStyle = passesFilter ? 'none' : 'grayscale(100%)';
              const bigDistanceText = formatDistanceBigUnit(user.distance);

              return (
                <div 
                  key={user.id || index} 
                  onClick={() => handleCardClick(user)}
                  style={{ position: 'relative', aspectRatio: '1/1', cursor: 'pointer', backgroundColor: '#222', overflow: 'hidden', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity, filter: filterStyle }}
                >
                  {user.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt={user.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#0088cc', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                      {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px', fontSize: '10px', textAlign: 'center' }}>
                    {isSelf ? 'You' : bigDistanceText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: view === 'map' ? 'block' : 'none', height: '100%', width: '100%', position: 'relative', flex: 1, zIndex: 1 }}>
          <MapContainer 
            center={[location.lat, location.lng]} 
            zoom={15} 
            style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
            zoomControl={false}
          >
            <MapController center={[location.lat, location.lng]} />
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mapFilteredUsers.map((user) => {
              const isSelf = currentUser && user.id === currentUser.id;
              const passesFilter = checkFilterPass(user);
              const isEnabled = isSelf ? (mapVisible && gridVisible) : passesFilter;
              return (
                <Marker 
                  key={user.id} 
                  position={[user.lat || location.lat, user.lng || location.lng]} 
                  icon={createProfileIcon(user, isEnabled, Boolean(isSelf))}
                  eventHandlers={{
                    click: () => handleCardClick(user),
                  }}
                />
              );
            })}
          </MapContainer>
        </div>

      </main>

      {/* PROFILE MODAL (SELF OR OTHER) */}
      {activeProfile && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setSelectedProfile(null)}>
          <div style={{ backgroundColor: '#1e1e1e', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px 20px 40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ width: '40px', height: '4px', backgroundColor: '#444', borderRadius: '2px', marginBottom: '16px' }} />

            <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              
              <div style={{ width: '90px', height: '90px', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#222', border: '3px solid #007bff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                {activeProfile.avatar ? (
                  <img src={activeProfile.