// App.tsx — Main React SPA component for Who's Nearby
// Covers: initialization, profile setup, grid/map views, filters, payments,
// profile card, games menu, footer navigation.

import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import type {
  VipCampaign,
  VipFailedRewardClaim,
  VipFailureAlertSummary,
  VipRewardNotificationQueueHealth,
  VipRewardRetryAudit,
} from './components/vip-campaign-panel';
import { VipGrantNoticeDialog } from './components/vip-grant-notice-dialog.js';
import type {
  PassPaymentLookup,
  PassPaymentSearchBy,
  PaymentRecord,
  PaymentReviewCopy,
} from './components/PaymentReviewPanel';
import type {
  RafflePaymentReviewCopy,
  RafflePaymentReviewIntent,
} from './components/RafflePaymentReviewPanel';
import {
  DEFAULT_HOW_MANY_FILTER,
  matchesHowManyFilter,
  nextHowManyFilterValue,
  normalizeHowManyFilterValue,
} from './utils/how-many-filter';
import {
  createFilterRenewalConfirmationReporter,
  trackEvent,
} from './utils/analytics.js';
import {
  ACCESS_RECHECK_INTERVAL_MS,
  PENDING_ACCESS_RECHECK_STORAGE_KEY,
  canRetryPendingPaymentCheck,
  checkPendingAccessProfile,
  clearPendingAccessRecheck as clearPendingAccessRecheckStorage,
  createPendingAccessRecheck,
  getAccessRecheckRetryDelayMs,
  getMinimumFilterSubscriptionExpiry,
  getMinimumPaidEntitlementExpiry,
  getPaidEntitlementOutcome,
  getActiveAccessState,
  hasUnresolvedPaidPurchase,
  hasFilterOptionAccess,
  getPendingAccessRecheckPhase,
  isPaidEntitlementActive,
  isPendingAccessConfirmed,
  isPaidEntitlementConfirmed,
  loadPendingAccessRecheck,
  selectMostRecentPendingAccessRecheck,
  savePendingAccessRecheck,
  shouldContinueAccessRechecks,
  shouldNotifyFilterAccessEnded,
  shouldNotifyFilterAccessRestored,
  type PendingAccessRecheck,
} from './utils/access-entitlements';
import { filterProfilesByMatchVisibility } from './utils/filter-visibility';
import {
  isLocationSaveConfirmed,
  requestLocationAccess,
} from './utils/request-location.js';
import { hasUploadedMainProfileImage } from './utils/profile-image.js';
import {
  FILTER_CYCLE_OPTIONS,
  getEffectiveGenderFilterValues,
  isHkmoDateMenOnlyFilterLocked,
  matchesEntryGenderAccess,
  matchesGenderFilter,
  matchesPlaystyleFilter,
  nextFilterCycleValue,
  normalizeGenderFilterValues,
  type GenderFilterValue,
} from './utils/preference-filters';
import { isInvisibilityExpired, resolveGridVisibility, resolveMapVisibility } from './utils/invisibility-expiry';
import {
  createFlyingMessageNotice,
  getFlyingMessageNoticeAfterDismissal,
  getFlyingMessageNoticeAfterMessage,
  getFlyingMessageDraftAfterOutcome,
  getFlyingMessagePurchaseResolution,
  getRafflePurchaseOutcome,
  shouldAutoDismissFlyingMessageNotice,
  shouldPersistFlyingMessageOutcome,
  type FlyingMessageNoticeState,
  type RafflePurchaseOutcome,
} from './utils/purchase-fulfillment.js';
import {
  DEFAULT_FILTER_PREFERENCES,
  loadFilterPreferences,
  removeFilterPreferences,
  saveFilterPreferences,
} from './utils/filter-preferences-storage';

import { getDefaultDiscoveryView } from './config/app-modules.js';
import {
  resolveAppEntry,
  resolveInitialProfileIdentity,
  type AppEntryId,
  type AppRuntimeConfig,
} from './config/entries';
import {
  BottomNavigationModule,
  FlyingMessageModule,
  GridFilterModule,
  NearbyGridModule,
  StarMenuRaffleModule,
} from './modules';
import {
  buildProfileHeightOptions,
  buildProfileWeightOptions,
  PROFILE_HOW_MANY_CYCLE_OPTIONS,
  PROFILE_PLAYSTYLE_CYCLE_OPTIONS,
  PROFILE_ROLE_CYCLE_OPTIONS,
  PROFILE_SAFETY_CYCLE_OPTIONS,
  PROFILE_WHERE_CYCLE_OPTIONS,
} from './modules/profile-completion/profile-completion-options.js';

const reportFilterRenewalConfirmed = createFilterRenewalConfirmationReporter();

const loadVipCampaignPanelModule = () => import('./components/vip-campaign-panel.js');
const MapView = lazy(() => import('./modules/map/NearbyMapModule'));
const VipCampaignPanel = lazy(() =>
  loadVipCampaignPanelModule().then(({ VipCampaignPanel: Panel }) => ({
    default: Panel,
  })),
);
const PaymentReviewPanel = lazy(() =>
  import('./components/PaymentReviewPanel').then(({ PaymentReviewPanel: Panel }) => ({
    default: Panel,
  })),
);
const ProfileSetupPreviewModule = lazy(() =>
  import('./modules/profile-completion/ProfileSetupPreviewModule'),
);
const ProfileCompletionModule = lazy(() =>
  import('./modules/profile-completion/ProfileCompletionModule'),
);
const WalletConnectModule = lazy(() =>
  import('./modules/wallet/WalletConnectModule'),
);
const HOW_MANY_GROUP_LABELS: Record<string, string> = {
  en: 'Groups',
  zh: '群组',
  'zh-CN': '群组',
  zhTW: '群組',
  'zh-TW': '群組',
  ja: 'グループ',
  ko: '그룹',
  ru: 'Группы',
};
const FILTER_UI_COPY: Record<LangKey, {
  hideNonMatching: string;
  accessRequired: string;
  renewAccess: string;
  renewFromNotice: string;
  renewEarly: string;
  renewalPending: string;
  filterSubscriptionExpires: string;
  renewingAccess: string;
  accessEnded: string;
  accessRestored: string;
  hkmoMenOnly: string;
}> = {
  en: { hideNonMatching: 'Hide non-matching users', accessRequired: 'VIP or an active filter subscription is required to use filters.', renewAccess: 'Get filter access', renewFromNotice: 'Renew filter access', renewEarly: 'Extend filter access', renewalPending: 'Confirming renewal…', filterSubscriptionExpires: 'Filter subscription expires:', renewingAccess: 'Opening payment…', accessEnded: 'Your VIP or filter access ended. Saved filter settings were cleared and defaults restored.', accessRestored: 'Your VIP or filter access is active again. Premium filters are available.', hkmoMenOnly: 'HKMO Date search is locked to men for non-VIP users.' },
  'zh-CN': { hideNonMatching: '隐藏不匹配的用户', accessRequired: '使用筛选需要 VIP 或有效筛选订阅。', renewAccess: '获取筛选权限', renewFromNotice: '续订筛选权限', renewEarly: '提前延长筛选权限', renewalPending: '正在确认续订…', filterSubscriptionExpires: '筛选订阅到期时间：', renewingAccess: '正在打开付款…', accessEnded: '您的 VIP 或筛选权限已结束。已清除保存的筛选设置并恢复默认值。', accessRestored: '您的 VIP 或筛选权限已恢复，现在可以使用高级筛选。', hkmoMenOnly: 'HKMO Date 非 VIP 用户仅可筛选男性。' },
  'zh-TW': { hideNonMatching: '隱藏不符合條件的用戶', accessRequired: '使用篩選需要 VIP 或有效篩選訂閱。', renewAccess: '取得篩選權限', renewFromNotice: '續訂篩選權限', renewEarly: '提前延長篩選權限', renewalPending: '正在確認續訂…', filterSubscriptionExpires: '篩選訂閱到期時間：', renewingAccess: '正在開啟付款…', accessEnded: '您的 VIP 或篩選權限已結束。已清除已儲存的篩選設定並恢復預設值。', accessRestored: '您的 VIP 或篩選權限已恢復，現在可以使用進階篩選。', hkmoMenOnly: 'HKMO Date 非 VIP 用戶僅可篩選男性。' },
  ja: { hideNonMatching: '条件に合わないユーザーを非表示', accessRequired: 'フィルターを使うにはVIPまたは有効な購読が必要です。', renewAccess: 'フィルターを利用する', renewFromNotice: 'フィルター利用を更新', renewEarly: 'フィルター利用期間を延長', renewalPending: '更新を確認中…', filterSubscriptionExpires: 'フィルター利用期限:', renewingAccess: '決済を開いています…', accessEnded: 'VIPまたはフィルター利用権が終了しました。保存済みの設定を削除し、初期設定に戻しました。', accessRestored: 'VIPまたはフィルター利用権が復元されました。プレミアムフィルターを利用できます。', hkmoMenOnly: 'HKMO DateではVIP以外のユーザーは男性のみ検索できます。' },
  ko: { hideNonMatching: '조건에 맞지 않는 사용자 숨기기', accessRequired: '필터를 사용하려면 VIP 또는 활성 필터 구독이 필요합니다.', renewAccess: '필터 이용권 받기', renewFromNotice: '필터 이용권 갱신', renewEarly: '필터 이용 기간 연장', renewalPending: '갱신 확인 중…', filterSubscriptionExpires: '필터 구독 만료:', renewingAccess: '결제 창을 여는 중…', accessEnded: 'VIP 또는 필터 이용 권한이 종료되었습니다. 저장된 필터 설정을 지우고 기본값으로 복원했습니다.', accessRestored: 'VIP 또는 필터 이용 권한이 복원되었습니다. 프리미엄 필터를 사용할 수 있습니다.', hkmoMenOnly: 'HKMO Date에서는 VIP가 아닌 사용자는 남성만 검색할 수 있습니다.' },
  ru: { hideNonMatching: 'Скрывать неподходящих пользователей', accessRequired: 'Для фильтров нужен VIP или активная подписка.', renewAccess: 'Получить доступ к фильтрам', renewFromNotice: 'Продлить доступ к фильтрам', renewEarly: 'Продлить доступ заранее', renewalPending: 'Подтверждаем продление…', filterSubscriptionExpires: 'Подписка действует до:', renewingAccess: 'Открываем оплату…', accessEnded: 'Доступ VIP или к фильтрам завершён. Сохранённые настройки фильтров удалены, восстановлены значения по умолчанию.', accessRestored: 'Доступ VIP или к фильтрам восстановлен. Премиум-фильтры снова доступны.', hkmoMenOnly: 'В HKMO Date пользователи без VIP могут искать только мужчин.' },
};
const PAYMENT_RECHECK_COPY: Record<LangKey, {
  checking: string;
  pending: string;
  checkAgain: string;
  checkingButton: string;
}> = {
  en: { checking: 'Checking your {entitlement} purchase…', pending: 'Your {entitlement} purchase is not confirmed yet.', checkAgain: 'Check again', checkingButton: 'Checking…' },
  'zh-CN': { checking: '正在确认您的{entitlement}订单…', pending: '您的{entitlement}订单尚未确认。', checkAgain: '重新检查', checkingButton: '正在检查…' },
  'zh-TW': { checking: '正在確認您的{entitlement}訂單…', pending: '您的{entitlement}訂單尚未確認。', checkAgain: '重新檢查', checkingButton: '正在檢查…' },
  ja: { checking: '購入した{entitlement}を確認しています…', pending: '購入した{entitlement}はまだ確認されていません。', checkAgain: 'もう一度確認', checkingButton: '確認中…' },
  ko: { checking: '구매한 {entitlement}을 확인하고 있습니다…', pending: '구매한 {entitlement}이 아직 확인되지 않았습니다.', checkAgain: '다시 확인', checkingButton: '확인 중…' },
  ru: { checking: 'Проверяем покупку: {entitlement}…', pending: 'Покупка «{entitlement}» ещё не подтверждена.', checkAgain: 'Проверить снова', checkingButton: 'Проверяем…' },
};
const PAYMENT_RECHECK_ENTITLEMENT_COPY: Record<
  LangKey,
  Record<PendingAccessRecheck['entitlement'], string>
> = {
  en: {
    filter: 'filter subscription',
    vip: 'VIP access',
    invisible: 'invisibility pass',
    hideAge: 'Hide Age pass',
    editProfile: 'profile editing pass',
  },
  'zh-CN': {
    filter: '筛选订阅',
    vip: 'VIP 权限',
    invisible: '隐身权限',
    hideAge: '隐藏年龄权限',
    editProfile: '资料编辑权限',
  },
  'zh-TW': {
    filter: '篩選訂閱',
    vip: 'VIP 權限',
    invisible: '隱身權限',
    hideAge: '隱藏年齡權限',
    editProfile: '資料編輯權限',
  },
  ja: {
    filter: 'フィルター利用権',
    vip: 'VIP利用権',
    invisible: '非表示パス',
    hideAge: '年齢非表示パス',
    editProfile: 'プロフィール編集パス',
  },
  ko: {
    filter: '필터 이용권',
    vip: 'VIP 이용권',
    invisible: '비공개 이용권',
    hideAge: '나이 숨김 이용권',
    editProfile: '프로필 편집 이용권',
  },
  ru: {
    filter: 'подписка на фильтры',
    vip: 'доступ VIP',
    invisible: 'режим невидимости',
    hideAge: 'скрытие возраста',
    editProfile: 'редактирование профиля',
  },
};
const FILTER_EARLY_RENEWAL_PROMPT_COPY: Record<LangKey, string> = {
  en: 'Extend your filter subscription by 30 days from its current expiry for 1,000 Telegram Stars?',
  'zh-CN': '支付 1,000 Telegram Stars，将筛选订阅从当前到期时间起延长 30 天？',
  'zh-TW': '支付 1,000 Telegram Stars，將篩選訂閱從目前到期時間起延長 30 天？',
  ja: 'Telegram Stars 1,000個で、現在の期限からフィルター利用期間を30日延長しますか？',
  ko: 'Telegram Stars 1,000개로 현재 만료일부터 필터 이용 기간을 30일 연장할까요?',
  ru: 'Продлить подписку на фильтры на 30 дней после текущего срока за 1 000 Telegram Stars?',
};
const PAID_FEATURE_NOTICE_COPY: Record<LangKey, {
  hideAgeEnded: string;
  hideAgeActive: string;
  hideAgeActiveNoExpiry: string;
  renewHideAge: string;
  invisibleEnded: string;
  invisibleActive: string;
  invisibleActiveNoExpiry: string;
  renewInvisible: string;
  renewing: string;
}> = {
  en: {
    hideAgeEnded: 'Age hiding ended. Renew it to hide your age again.',
    hideAgeActive: 'Your age is hidden until {date}.',
    hideAgeActiveNoExpiry: 'Your age is hidden.',
    renewHideAge: 'Renew age hiding',
    invisibleEnded: 'Your invisibility period ended. Renew it to hide your profile again.',
    invisibleActive: 'Your profile is hidden until {date}.',
    invisibleActiveNoExpiry: 'Your profile is hidden from the grid.',
    renewInvisible: 'Renew invisibility',
    renewing: 'Opening payment…',
  },
  'zh-CN': {
    hideAgeEnded: '隐藏年龄的权限已结束。续订后可再次隐藏年龄。',
    hideAgeActive: '您的年龄已隐藏至 {date}。',
    hideAgeActiveNoExpiry: '您的年龄已隐藏。',
    renewHideAge: '续订隐藏年龄',
    invisibleEnded: '隐身期限已结束。续订后可再次隐藏个人资料。',
    invisibleActive: '您的个人资料已隐藏至 {date}。',
    invisibleActiveNoExpiry: '您的个人资料已从网格中隐藏。',
    renewInvisible: '续订隐身',
    renewing: '正在打开付款…',
  },
  'zh-TW': {
    hideAgeEnded: '隱藏年齡的權限已結束。續訂後可再次隱藏年齡。',
    hideAgeActive: '您的年齡已隱藏至 {date}。',
    hideAgeActiveNoExpiry: '您的年齡已隱藏。',
    renewHideAge: '續訂隱藏年齡',
    invisibleEnded: '隱身期限已結束。續訂後可再次隱藏個人資料。',
    invisibleActive: '您的個人資料已隱藏至 {date}。',
    invisibleActiveNoExpiry: '您的個人資料已從網格中隱藏。',
    renewInvisible: '續訂隱身',
    renewing: '正在開啟付款…',
  },
  ja: {
    hideAgeEnded: '年齢非表示の利用期間が終了しました。更新すると再び年齢を隠せます。',
    hideAgeActive: '年齢は {date} まで非表示です。',
    hideAgeActiveNoExpiry: '年齢は非表示です。',
    renewHideAge: '年齢非表示を更新',
    invisibleEnded: '非表示期間が終了しました。更新するとプロフィールを再び隠せます。',
    invisibleActive: 'プロフィールは {date} まで非表示です。',
    invisibleActiveNoExpiry: 'プロフィールはグリッドに表示されていません。',
    renewInvisible: '非表示を更新',
    renewing: '決済を開いています…',
  },
  ko: {
    hideAgeEnded: '나이 숨김 이용 기간이 끝났습니다. 갱신하면 나이를 다시 숨길 수 있습니다.',
    hideAgeActive: '나이가 {date}까지 숨겨져 있습니다.',
    hideAgeActiveNoExpiry: '나이가 숨겨져 있습니다.',
    renewHideAge: '나이 숨김 갱신',
    invisibleEnded: '비공개 이용 기간이 끝났습니다. 갱신하면 프로필을 다시 숨길 수 있습니다.',
    invisibleActive: '프로필이 {date}까지 숨겨져 있습니다.',
    invisibleActiveNoExpiry: '프로필이 그리드에서 숨겨져 있습니다.',
    renewInvisible: '비공개 갱신',
    renewing: '결제 창을 여는 중…',
  },
  ru: {
    hideAgeEnded: 'Срок скрытия возраста закончился. Продлите доступ, чтобы снова скрыть возраст.',
    hideAgeActive: 'Возраст скрыт до {date}.',
    hideAgeActiveNoExpiry: 'Возраст скрыт.',
    renewHideAge: 'Продлить скрытие возраста',
    invisibleEnded: 'Срок невидимости закончился. Продлите доступ, чтобы снова скрыть профиль.',
    invisibleActive: 'Профиль скрыт до {date}.',
    invisibleActiveNoExpiry: 'Профиль скрыт из сетки.',
    renewInvisible: 'Продлить невидимость',
    renewing: 'Открываем оплату…',
  },
};
const FILTER_CYCLE_COPY: Record<LangKey, { roleOff: string; depends: string; partyWithStuff: string }> = {
  en: { roleOff: 'Slut', depends: 'Depends', partyWithStuff: 'Party with stuff' },
  'zh-CN': { roleOff: 'Slut', depends: '视情况而定', partyWithStuff: '带东西的派对' },
  'zh-TW': { roleOff: 'Slut', depends: '視情況而定', partyWithStuff: '帶東西的派對' },
  ja: { roleOff: 'Slut', depends: '場合による', partyWithStuff: '薬物ありのパーティー' },
  ko: { roleOff: 'Slut', depends: '상황에 따라', partyWithStuff: '약물이 있는 파티' },
  ru: { roleOff: 'Slut', depends: 'Зависит от ситуации', partyWithStuff: 'Вечеринка с веществами' },
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
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
        openLink?: (url: string) => void;
        showAlert?: (message: string) => void;
        openInvoice?: (url: string, callback?: (status: string) => void) => void;
        CloudStorage?: {
          setItem?: (key: string, value: string, callback?: (error?: string) => void) => void;
          getItem?: (key: string, callback?: (error?: string, value?: string) => void) => void;
        };
      };
    };
  }
}

const PAYMENT_WORKER_URL = 'https://whosnearbybot.mileschan852.workers.dev';
const WORKER_REQUEST_TIMEOUT_MS = 12_000;

type LangKey = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';
const MAP_PROFILE_PHOTO_REQUIRED_COPY: Record<LangKey, string> = {
  en: 'Add a profile photo to your Telegram account before using the map.',
  'zh-CN': '请先为 Telegram 账号设置个人资料照片，再使用地图。',
  'zh-TW': '請先為 Telegram 帳號設定個人資料照片，再使用地圖。',
  ja: '地図を使う前に、Telegramアカウントにプロフィール写真を設定してください。',
  ko: '지도를 사용하기 전에 Telegram 계정에 프로필 사진을 설정해 주세요.',
  ru: 'Перед использованием карты добавьте фотографию профиля в аккаунт Telegram.',
};
type FilterRenewalLocation = 'filter_expiry_notice' | 'filter_access_prompt' | 'filter_option' | 'active_filter_subscription';
type ProfileInterestCopy = {
  send: string;
  sending: string;
  sent: string;
  cooldown: string;
  unavailable: string;
  failed: string;
  received: string;
};

const PROFILE_INTEREST_COPY: Record<LangKey, ProfileInterestCopy> = {
  en: {
    send: 'Send interest',
    sending: 'Sending interest…',
    sent: 'Interest sent. It will be visible for 24 hours.',
    cooldown: 'You can send interest to this profile again after 24 hours.',
    unavailable: 'Interest is temporarily unavailable. Refresh and try again.',
    failed: 'Could not send interest. Try again.',
    received: 'Interested in you',
  },
  'zh-CN': {
    send: '表达兴趣',
    sending: '正在发送…',
    sent: '已发送兴趣，对方可在 24 小时内看到。',
    cooldown: '24 小时后可以再次向此用户表达兴趣。',
    unavailable: '兴趣功能暂不可用，请刷新后重试。',
    failed: '发送失败，请重试。',
    received: '对你感兴趣',
  },
  'zh-TW': {
    send: '表達興趣',
    sending: '正在傳送…',
    sent: '已傳送興趣，對方可在 24 小時內看到。',
    cooldown: '24 小時後可以再次向此用戶表達興趣。',
    unavailable: '興趣功能暫時無法使用，請重新整理後再試。',
    failed: '傳送失敗，請重試。',
    received: '對你有興趣',
  },
  ja: {
    send: '興味を伝える',
    sending: '送信中…',
    sent: '興味を送りました。24時間表示されます。',
    cooldown: 'このプロフィールには24時間後に再度送信できます。',
    unavailable: '現在利用できません。更新してもう一度お試しください。',
    failed: '送信できませんでした。もう一度お試しください。',
    received: 'あなたに興味があります',
  },
  ko: {
    send: '관심 보내기',
    sending: '보내는 중…',
    sent: '관심을 보냈습니다. 24시간 동안 표시됩니다.',
    cooldown: '24시간 후에 이 프로필에 다시 관심을 보낼 수 있습니다.',
    unavailable: '현재 사용할 수 없습니다. 새로고침 후 다시 시도하세요.',
    failed: '관심을 보내지 못했습니다. 다시 시도하세요.',
    received: '회원님에게 관심이 있습니다',
  },
  ru: {
    send: 'Выразить интерес',
    sending: 'Отправляем…',
    sent: 'Интерес отправлен и будет виден 24 часа.',
    cooldown: 'Повторно выразить интерес этому профилю можно через 24 часа.',
    unavailable: 'Функция временно недоступна. Обновите страницу и повторите попытку.',
    failed: 'Не удалось отправить интерес. Попробуйте ещё раз.',
    received: 'Интересуется вами',
  },
};

type ScreenHelpSection = { title: string; description: string };
type ScreenHelpCopy = {
  open: string;
  title: string;
  intro: string;
  closeHint: string;
  nearby: ScreenHelpSection;
  filter: ScreenHelpSection;
  refresh: ScreenHelpSection;
  grid: ScreenHelpSection;
  map: ScreenHelpSection;
  invisibility: ScreenHelpSection;
  star: ScreenHelpSection;
  flying: ScreenHelpSection;
  navigation: ScreenHelpSection;
};

const SCREEN_HELP_COPY: Record<LangKey, ScreenHelpCopy> = {
  en: {
    open: 'Screen guide',
    title: 'What’s on this screen?',
    intro: 'You are viewing {view}. Here is what the controls do.',
    closeHint: 'Tap anywhere to close.',
    nearby: { title: 'Nearby count', description: 'Shows how many profiles are in your current nearby results.' },
    filter: { title: 'Filter', description: 'Choose which profiles appear. Some filter options require VIP or an active filter subscription.' },
    refresh: { title: 'Refresh', description: 'Reloads nearby profiles and their latest status.' },
    grid: { title: 'Profile tiles', description: 'Tap a tile to open that person’s profile. Dimmed tiles do not match your current filters.' },
    map: { title: 'Map', description: 'Move around the map and tap a profile marker to open that person’s profile.' },
    invisibility: { title: 'Go invisible', description: 'Tap Grid in the bottom bar to turn your profile visibility off. If Invisibility access is not active, the app will prompt you to activate or renew it. While invisible, other users will not see you in Grid or Map, even if your Map indicator is on. You will still see your own marker on your map.' },
    star: { title: 'Star menu', description: 'Open the star button to see the raffle ticket and other configured features.' },
    flying: { title: 'Flying message', description: 'Use the message bar below the navigation bar to send text that moves across the screen.' },
    navigation: { title: 'Bottom navigation', description: 'Grid and Map switch views. Chat opens the bot chat, and Wallet opens the wallet connection.' },
  },
  'zh-CN': {
    open: '屏幕说明',
    title: '此页面显示什么？',
    intro: '当前页面：{view}。以下是各个控件的用途。',
    closeHint: '点击任意位置即可关闭。',
    nearby: { title: '附近人数', description: '显示当前附近结果中的个人资料数量。' },
    filter: { title: '筛选', description: '选择要显示的个人资料。部分筛选功能需要 VIP 或有效的筛选订阅。' },
    refresh: { title: '刷新', description: '重新加载附近资料及其最新状态。' },
    grid: { title: '资料卡片', description: '点击卡片查看对方资料。变暗的卡片表示不符合当前筛选条件。' },
    map: { title: '地图', description: '移动地图并点击个人资料标记来查看对方资料。' },
    invisibility: { title: '隐身', description: '点击底部导航栏的“网格”按钮关闭个人资料可见状态。若没有有效的隐身权限，应用会提示你开通或续订。隐身期间，即使地图指示灯开启，其他用户也不会在网格或地图上看到你；你仍会在自己的地图上看到自己的标记。' },
    star: { title: '星星菜单', description: '点击星星按钮查看抽奖券和其他已配置功能。' },
    flying: { title: '飞行消息', description: '使用导航栏下方的消息栏发送会在屏幕上飞过的文字。' },
    navigation: { title: '底部导航', description: '网格和地图可切换页面；聊天会打开机器人聊天，钱包会打开钱包连接。' },
  },
  'zh-TW': {
    open: '畫面說明',
    title: '這個畫面顯示什麼？',
    intro: '目前頁面：{view}。以下是各個控制項的用途。',
    closeHint: '點擊任意位置即可關閉。',
    nearby: { title: '附近人數', description: '顯示目前附近結果中的個人資料數量。' },
    filter: { title: '篩選', description: '選擇要顯示的個人資料。部分篩選功能需要 VIP 或有效的篩選訂閱。' },
    refresh: { title: '重新整理', description: '重新載入附近資料及其最新狀態。' },
    grid: { title: '資料卡片', description: '點擊卡片查看對方資料。變暗的卡片表示不符合目前的篩選條件。' },
    map: { title: '地圖', description: '移動地圖並點擊個人資料標記以查看對方資料。' },
    invisibility: { title: '隱身', description: '點擊底部導覽列的「網格」按鈕關閉個人資料可見狀態。若沒有有效的隱身權限，應用程式會提示你開通或續訂。隱身期間，即使地圖指示燈已開啟，其他用戶也不會在網格或地圖上看到你；你仍會在自己的地圖上看到自己的標記。' },
    star: { title: '星星選單', description: '點擊星星按鈕查看抽獎券和其他已設定功能。' },
    flying: { title: '飛行訊息', description: '使用導覽列下方的訊息欄，傳送會在畫面上飛過的文字。' },
    navigation: { title: '底部導覽', description: '網格和地圖可切換頁面；聊天會開啟機器人聊天，錢包會開啟錢包連線。' },
  },
  ja: {
    open: '画面ガイド',
    title: 'この画面について',
    intro: '現在の画面：{view}。各ボタンの機能をご案内します。',
    closeHint: '画面のどこをタップしても閉じます。',
    nearby: { title: '近くの人数', description: '現在の近くの検索結果に含まれるプロフィール数です。' },
    filter: { title: 'フィルター', description: '表示するプロフィールを選びます。一部の項目にはVIPまたは有効なフィルター購読が必要です。' },
    refresh: { title: '更新', description: '近くのプロフィールと最新の状態を再読み込みします。' },
    grid: { title: 'プロフィール一覧', description: 'カードをタップするとプロフィールを表示します。暗く表示されたカードは現在のフィルターに一致していません。' },
    map: { title: '地図', description: '地図を動かし、プロフィールのマーカーをタップすると詳細を表示します。' },
    invisibility: { title: '非表示にする', description: '下部ナビゲーションの「Grid」をタップしてプロフィールの表示をオフにします。有効な非表示アクセスがない場合、購入または更新を案内します。非表示中はMapがオンでも、他のユーザーにはグリッドにも地図にも表示されません。自分の地図では自分のマーカーが見えます。' },
    star: { title: 'スター メニュー', description: '星のボタンから抽選チケットや設定された機能を開きます。' },
    flying: { title: 'フライングメッセージ', description: 'ナビゲーションバーの下にある入力欄から、画面を横切るメッセージを送信します。' },
    navigation: { title: '下部ナビゲーション', description: 'グリッドと地図で表示を切り替えます。チャットはボットのチャット、ウォレットはウォレット接続を開きます。' },
  },
  ko: {
    open: '화면 안내',
    title: '이 화면 안내',
    intro: '현재 화면: {view}. 각 버튼의 기능을 안내합니다.',
    closeHint: '화면의 아무 곳이나 누르면 닫힙니다.',
    nearby: { title: '주변 인원 수', description: '현재 주변 검색 결과에 표시된 프로필 수입니다.' },
    filter: { title: '필터', description: '표시할 프로필을 선택합니다. 일부 필터는 VIP 또는 유효한 필터 구독이 필요합니다.' },
    refresh: { title: '새로고침', description: '주변 프로필과 최신 상태를 다시 불러옵니다.' },
    grid: { title: '프로필 타일', description: '타일을 누르면 프로필을 볼 수 있습니다. 흐리게 표시된 타일은 현재 필터와 일치하지 않습니다.' },
    map: { title: '지도', description: '지도를 이동하고 프로필 표시를 누르면 해당 프로필을 볼 수 있습니다.' },
    invisibility: { title: '비공개로 전환', description: '하단 내비게이션의 Grid 버튼을 눌러 프로필 표시를 끄세요. 활성 비공개 권한이 없으면 구매 또는 갱신 안내가 표시됩니다. 비공개 중에는 Map 표시가 켜져 있어도 다른 사용자에게 그리드와 지도에 나타나지 않습니다. 본인 지도에는 본인 마커가 계속 표시됩니다.' },
    star: { title: '별 메뉴', description: '별 버튼에서 추첨 티켓과 설정된 기능을 확인할 수 있습니다.' },
    flying: { title: '플라잉 메시지', description: '내비게이션 바 아래 메시지 입력란에서 화면을 가로지르는 메시지를 보낼 수 있습니다.' },
    navigation: { title: '하단 내비게이션', description: '그리드와 지도로 화면을 전환합니다. 채팅은 봇 채팅을, 지갑은 지갑 연결을 엽니다.' },
  },
  ru: {
    open: 'Подсказка по экрану',
    title: 'Что показано на экране?',
    intro: 'Открыт раздел «{view}». Вот что делают элементы управления.',
    closeHint: 'Нажмите в любом месте, чтобы закрыть.',
    nearby: { title: 'Количество рядом', description: 'Число профилей в текущих результатах поиска поблизости.' },
    filter: { title: 'Фильтр', description: 'Выберите, какие профили показывать. Для некоторых фильтров нужен VIP или активная подписка на фильтр.' },
    refresh: { title: 'Обновить', description: 'Заново загружает профили поблизости и их актуальный статус.' },
    grid: { title: 'Карточки профилей', description: 'Нажмите карточку, чтобы открыть профиль. Затемнённые карточки не соответствуют текущим фильтрам.' },
    map: { title: 'Карта', description: 'Перемещайте карту и нажмите маркер профиля, чтобы открыть его.' },
    invisibility: { title: 'Режим невидимости', description: 'Нажмите «Сетка» в нижней панели, чтобы выключить видимость профиля. Если доступ к невидимости не активен, приложение предложит купить или продлить его. Пока вы скрыты, другие пользователи не увидят вас в сетке или на карте, даже если индикатор карты включён. Свой маркер на своей карте вы по-прежнему видите.' },
    star: { title: 'Меню со звездой', description: 'Нажмите кнопку со звездой, чтобы открыть билет розыгрыша и другие функции.' },
    flying: { title: 'Летающее сообщение', description: 'Отправьте текст через строку под панелью навигации — сообщение пролетит по экрану.' },
    navigation: { title: 'Нижняя навигация', description: 'Сетка и карта переключают разделы. Чат открывает чат с ботом, а кошелёк — подключение кошелька.' },
  },
};

function ScreenHelpOverlay({
  lang,
  view,
  viewLabel,
  filterEnabled,
  discoveryEnabled,
  starRaffleEnabled,
  flyingMessageEnabled,
  onClose,
}: {
  lang: LangKey;
  view: 'grid' | 'map';
  viewLabel: string;
  filterEnabled: boolean;
  discoveryEnabled: boolean;
  starRaffleEnabled: boolean;
  flyingMessageEnabled: boolean;
  onClose: () => void;
}) {
  const copy = SCREEN_HELP_COPY[lang];
  const sections = [
    ...(discoveryEnabled ? [copy.nearby] : []),
    ...(filterEnabled ? [copy.filter] : []),
    ...(discoveryEnabled ? [copy.refresh] : []),
    ...(view === 'grid' ? [copy.grid] : [copy.map]),
    ...(discoveryEnabled ? [copy.invisibility] : []),
    ...(starRaffleEnabled ? [copy.star] : []),
    ...(flyingMessageEnabled ? [copy.flying] : []),
    copy.navigation,
  ];

  return (
    <dialog
      open
      autoFocus
      tabIndex={-1}
      data-testid="screen-help-overlay"
      aria-modal="true"
      aria-label={copy.title}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        padding: '16px',
        width: '100vw',
        height: '100dvh',
        maxWidth: 'none',
        maxHeight: 'none',
        boxSizing: 'border-box',
        border: 'none',
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 6000,
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px', maxHeight: '80vh', overflowY: 'auto', backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', padding: '18px', boxShadow: '0 10px 40px rgba(0,0,0,0.7)' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px' }}>{copy.title}</h2>
        <p style={{ margin: '0 0 14px', color: '#bbb', fontSize: '13px', lineHeight: 1.45 }}>
          {copy.intro.replace('{view}', viewLabel)}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sections.map((section) => (
            <div key={section.title}>
              <h3 style={{ margin: '0 0 3px', fontSize: '14px', color: '#93c5fd' }}>{section.title}</h3>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.45, color: '#eee' }}>{section.description}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: '16px 0 0', textAlign: 'center', color: '#aaa', fontSize: '12px' }}>{copy.closeHint}</p>
      </div>
    </dialog>
  );
}

const NO_DISCOVERY_MODULES_COPY: Record<LangKey, string> = {
  en: 'No Grid & Filter or Map module is enabled for this app.',
  'zh-CN': '此应用未启用“网格与筛选”或“地图”模块。',
  'zh-TW': '此應用未啟用「網格與篩選」或「地圖」模組。',
  ja: 'このアプリではグリッド・フィルターまたは地図モジュールが有効になっていません。',
  ko: '이 앱에서 그리드·필터 또는 지도 모듈이 활성화되어 있지 않습니다.',
  ru: 'Для этого приложения не включен модуль сетки с фильтрами или карты.',
};

type FlyingMessageCopy = {
  placeholder: string;
  send: string;
  free: string;
  priceLabel: string;
  save: string;
  sending: string;
  cooldown: string;
  invoiceFallback: string;
  paymentProcessing: string;
  paymentRefunded: string;
  paymentRejected: string;
  dismiss: string;
};

type FlyingMessage = {
  id: string;
  tg_id: string;
  text: string;
  from_name: string;
  created_at: string;
  audience_bot: 'botA' | 'botB';
};

type RafflePrizeKey = 'vip' | 'filter' | 'invisible' | 'hide_age';
type RafflePurchaseTerminalOutcome = Exclude<RafflePurchaseOutcome, 'pending' | 'unsupported'>;
type FlyingMessageTerminalOutcome = 'cancelled' | 'refunded' | 'rejected';

type RaffleWinner = {
  prizeKey: RafflePrizeKey;
  username: string;
  expiresAt: string;
  isYou: boolean;
};

type RaffleDraw = {
  roundKey: string;
  drawnAt: string;
  winners: RaffleWinner[];
};

type RaffleState = {
  roundKey: string;
  closesAt: string;
  serverNow: string;
  ticketCount: number;
  userTicketCount: number;
  canPurchase: boolean;
  usernameRequired: boolean;
  latestDraw: RaffleDraw | null;
};

const raffleUiCopy: Record<LangKey, {
  button: string;
  summary: string;
  drawTime: string;
  shortfallRule: string;
  countdown: string;
  pool: string;
  yours: string;
  usernameRequired: string;
  adultProfileRequired: string;
  processing: string;
  ticketPurchased: string;
  paymentProcessing: string;
  invoiceFallback: string;
  paymentCancelled: string;
  paymentRefunded: string;
  paymentRejected: string;
  announcement: string;
  winnerMessage: string;
  prizes: Record<RafflePrizeKey, string>;
}> = {
  en: {
    button: 'Buy ticket',
    summary: 'VIP · filters · invisible · hide age',
    drawTime: '1st · 8 PM HKT',
    shortfallRule: '4+ tickets + 4 users: 4 distinct winners; shortfall: VIP only; no tickets: no rollover',
    countdown: '{d}d {h}:{m}:{s}',
    pool: 'Pool: {count}',
    yours: 'Yours: {count}',
    usernameRequired: 'Set a Telegram username before buying a ticket.',
    adultProfileRequired: 'Complete an adult profile before buying a ticket.',
    processing: 'Opening payment…',
    ticketPurchased: 'Ticket confirmed.',
    paymentProcessing: 'Payment received; the ticket is still being confirmed.',
    invoiceFallback: 'Continue in Telegram; the ticket appears after payment is confirmed.',
    paymentCancelled: 'Payment cancelled.',
    paymentRefunded: 'Your payment was refunded. No ticket was issued.',
    paymentRejected: 'No ticket was issued. Check the payment status in Telegram.',
    announcement: 'Raffle',
    winnerMessage: '{prize} winner: @{username}',
    prizes: {
      vip: '1-month VIP',
      filter: '1-month filter unlock',
      invisible: '1-month invisible mode',
      hide_age: '1-month hide age',
    },
  },
  'zh-CN': {
    button: '购买抽奖券',
    summary: 'VIP · 筛选 · 隐身 · 隐藏年龄',
    drawTime: '每月1日 · 香港时间20:00',
    shortfallRule: '至少4张票且4位用户：4位不同得主；不足仅抽1位VIP；无票不结转',
    countdown: '{d}天 {h}:{m}:{s}',
    pool: '本期票数：{count}',
    yours: '你的票：{count}',
    usernameRequired: '请先设置 Telegram 用户名，再购买抽奖券。',
    adultProfileRequired: '请先完成成人资料，再购买抽奖券。',
    processing: '正在打开付款…',
    ticketPurchased: '抽奖券已确认。',
    paymentProcessing: '已收到付款，正在确认抽奖券。',
    invoiceFallback: '请在 Telegram 中继续付款；确认后抽奖券会显示。',
    paymentCancelled: '付款已取消。',
    paymentRefunded: '付款已退款，未发放抽奖券。',
    paymentRejected: '未发放抽奖券，请在 Telegram 中查看付款状态。',
    announcement: '抽奖结果',
    winnerMessage: '{prize}得主：@{username}',
    prizes: {
      vip: '一个月 VIP',
      filter: '一个月筛选解锁',
      invisible: '一个月隐身模式',
      hide_age: '一个月隐藏年龄',
    },
  },
  'zh-TW': {
    button: '購買抽獎券',
    summary: 'VIP · 篩選 · 隱形 · 隱藏年齡',
    drawTime: '每月1日 · 香港時間20:00',
    shortfallRule: '至少4張票且4位用戶：4位不同得主；不足僅抽1位VIP；無票不結轉',
    countdown: '{d}天 {h}:{m}:{s}',
    pool: '本期票數：{count}',
    yours: '你的票：{count}',
    usernameRequired: '請先設定 Telegram 使用者名稱，再購買抽獎券。',
    adultProfileRequired: '請先完成成人資料，再購買抽獎券。',
    processing: '正在開啟付款…',
    ticketPurchased: '抽獎券已確認。',
    paymentProcessing: '已收到付款，正在確認抽獎券。',
    invoiceFallback: '請在 Telegram 中繼續付款；確認後抽獎券會顯示。',
    paymentCancelled: '付款已取消。',
    paymentRefunded: '款項已退款，未發放抽獎券。',
    paymentRejected: '未發放抽獎券，請在 Telegram 中查看付款狀態。',
    announcement: '抽獎結果',
    winnerMessage: '{prize}得主：@{username}',
    prizes: {
      vip: '一個月 VIP',
      filter: '一個月篩選解鎖',
      invisible: '一個月隱形模式',
      hide_age: '一個月隱藏年齡',
    },
  },
  ja: {
    button: 'チケット購入',
    summary: 'VIP・フィルター・透明化・年齢非表示',
    drawTime: '毎月1日 · 香港時間20:00',
    shortfallRule: 'チケット4枚以上・4人以上で別々の4人。不足はVIP1名のみ。無票は繰越なし',
    countdown: '{d}日 {h}:{m}:{s}',
    pool: '販売数: {count}',
    yours: '所持数: {count}',
    usernameRequired: 'チケット購入にはTelegramユーザー名が必要です。',
    adultProfileRequired: '成人プロフィールを完了してから購入してください。',
    processing: '決済を開いています…',
    ticketPurchased: 'チケットが確定しました。',
    paymentProcessing: '決済を受け付けました。チケットを確認中です。',
    invoiceFallback: 'Telegramで決済を続けてください。確認後にチケットが表示されます。',
    paymentCancelled: '決済はキャンセルされました。',
    paymentRefunded: 'お支払いは返金され、チケットは発行されませんでした。',
    paymentRejected: 'チケットは発行されませんでした。Telegramで支払い状況をご確認ください。',
    announcement: '抽選結果',
    winnerMessage: '{prize}の当選者: @{username}',
    prizes: {
      vip: '1か月VIP',
      filter: '1か月フィルター解除',
      invisible: '1か月透明モード',
      hide_age: '1か月年齢非表示',
    },
  },
  ko: {
    button: '티켓 구매',
    summary: 'VIP · 필터 · 비공개 · 나이 숨기기',
    drawTime: '매월 1일 · 홍콩 시간 20:00',
    shortfallRule: '티켓 4장 이상·사용자 4명 이상이면 서로 다른 4명 당첨; 부족하면 VIP 1명만. 티켓 없으면 이월 없음',
    countdown: '{d}일 {h}:{m}:{s}',
    pool: '총 티켓: {count}',
    yours: '내 티켓: {count}',
    usernameRequired: '티켓을 구매하려면 Telegram 사용자 이름이 필요합니다.',
    adultProfileRequired: '성인 프로필을 완료한 뒤 구매할 수 있습니다.',
    processing: '결제 창을 여는 중…',
    ticketPurchased: '티켓이 확인되었습니다.',
    paymentProcessing: '결제가 접수되었습니다. 티켓을 확인 중입니다.',
    invoiceFallback: 'Telegram에서 결제를 계속하세요. 확인 후 티켓이 표시됩니다.',
    paymentCancelled: '결제가 취소되었습니다.',
    paymentRefunded: '결제가 환불되어 티켓이 발급되지 않았습니다.',
    paymentRejected: '티켓이 발급되지 않았습니다. Telegram에서 결제 상태를 확인해 주세요.',
    announcement: '추첨 결과',
    winnerMessage: '{prize} 당첨자: @{username}',
    prizes: {
      vip: '1개월 VIP',
      filter: '1개월 필터 잠금 해제',
      invisible: '1개월 비공개 모드',
      hide_age: '1개월 나이 숨기기',
    },
  },
  ru: {
    button: 'Купить билет',
    summary: 'VIP · фильтры · невидимость · скрытие возраста',
    drawTime: '1-го числа · 20:00 по Гонконгу',
    shortfallRule: '4+ билета и 4 человека — 4 разных победителя; иначе только VIP; без билетов переноса нет',
    countdown: '{d}д {h}:{m}:{s}',
    pool: 'Билетов: {count}',
    yours: 'Ваши: {count}',
    usernameRequired: 'Для покупки билета нужен username в Telegram.',
    adultProfileRequired: 'Перед покупкой заполните профиль совершеннолетнего.',
    processing: 'Открываем оплату…',
    ticketPurchased: 'Билет подтверждён.',
    paymentProcessing: 'Оплата получена, билет ещё подтверждается.',
    invoiceFallback: 'Продолжите оплату в Telegram; билет появится после подтверждения.',
    paymentCancelled: 'Оплата отменена.',
    paymentRefunded: 'Оплата возвращена, билет не выдан.',
    paymentRejected: 'Билет не выдан. Проверьте статус платежа в Telegram.',
    announcement: 'Розыгрыш',
    winnerMessage: 'Победитель ({prize}): @{username}',
    prizes: {
      vip: 'VIP на 1 месяц',
      filter: 'Фильтр на 1 месяц',
      invisible: 'Невидимость на 1 месяц',
      hide_age: 'Скрытие возраста на 1 месяц',
    },
  },
};

const paymentReviewCopy: Record<LangKey, PaymentReviewCopy> = {
  en: {
    title: 'Payment review',
    privacy: 'Admin-only. Charge IDs are never returned in lookup results.',
    searchPlaceholder: 'Payment reference or Telegram user ID',
    search: 'Search',
    refresh: 'Refresh',
    loading: 'Loading payments…',
    loadError: 'Could not load payment records. Try again.',
    empty: 'No payment records found.',
    loadMore: 'Load more',
    close: 'Close',
    reference: 'Payment reference',
    telegramId: 'Telegram ID',
    type: 'Type',
    amount: 'Amount',
    status: 'Status',
    date: 'Date / time',
    passLookupTitle: 'Check pass access',
    passLookupHint: 'Search by Telegram account or charge ID. Charge IDs are used only to match receipts and are not included in results.',
    passLookupPlaceholder: 'Enter a Telegram ID or payment charge ID',
    passLookupByTelegram: 'Telegram ID',
    passLookupByCharge: 'Payment charge ID',
    passLookupProfileMissing: 'No profile found for this search.',
    passLookupReceipts: 'Hide Age / Invisibility receipts',
    passLookupNoReceipts: 'No matching pass receipts.',
    passLookupHideAge: 'Hide Age',
    passLookupInvisibility: 'Invisibility',
    passLookupEnabled: 'Enabled',
    passLookupDisabled: 'Disabled',
    passLookupActive: 'Active',
    passLookupInactive: 'Inactive',
    passLookupGridVisible: 'Grid visible',
    passLookupGridHidden: 'Grid hidden',
    passLookupExpires: 'Expires',
    passLookupNoExpiry: 'No expiry recorded',
    passLookupMoreReceipts: 'Showing the latest 25 receipts.',
    paid: 'Paid',
    fulfilled: 'Completed',
    refunded: 'Refunded',
    rejected: 'Rejected',
    pending: 'Pending',
    prechecked: 'Checking',
    cancelled: 'Cancelled',
    failed: 'Failed',
    typeLabels: {
      hide_age: 'Hide Age',
      invisible: 'Invisible',
      edit_profile: 'Edit Profile Pass',
      change_filter: 'Filter Subscription',
      change_preference: 'Preference Change',
      raffle_ticket: 'Raffle Ticket',
      flying_message: 'Flying Message',
    },
  },
  'zh-CN': {
    title: '付款记录审核',
    privacy: '仅管理员可查看。查询结果不会返回付款交易编号。',
    searchPlaceholder: '付款参考号或 Telegram 用户 ID',
    search: '搜索',
    refresh: '刷新',
    loading: '正在加载付款记录…',
    loadError: '无法加载付款记录，请重试。',
    empty: '未找到付款记录。',
    loadMore: '加载更多',
    close: '关闭',
    reference: '付款参考号',
    telegramId: 'Telegram 用户 ID',
    type: '类型',
    amount: '金额',
    status: '状态',
    date: '日期 / 时间',
    passLookupTitle: '检查通行证权限',
    passLookupHint: '可按 Telegram 账号或付款交易编号搜索。交易编号仅用于比对，不会包含在结果中。',
    passLookupPlaceholder: '输入 Telegram 用户 ID 或付款交易编号',
    passLookupByTelegram: 'Telegram 用户 ID',
    passLookupByCharge: '付款交易编号',
    passLookupProfileMissing: '未找到对应的个人资料。',
    passLookupReceipts: '隐藏年龄 / 隐身付款记录',
    passLookupNoReceipts: '未找到相符的通行证付款记录。',
    passLookupHideAge: '隐藏年龄',
    passLookupInvisibility: '隐身模式',
    passLookupEnabled: '已启用',
    passLookupDisabled: '已停用',
    passLookupActive: '有效',
    passLookupInactive: '已失效',
    passLookupGridVisible: '网格可见',
    passLookupGridHidden: '网格隐藏',
    passLookupExpires: '到期时间',
    passLookupNoExpiry: '没有到期记录',
    passLookupMoreReceipts: '仅显示最近 25 条记录。',
    paid: '已付款',
    fulfilled: '已完成',
    refunded: '已退款',
    rejected: '已拒绝',
    pending: '待处理',
    prechecked: '检查中',
    cancelled: '已取消',
    failed: '失败',
    typeLabels: {
      hide_age: '隐藏年龄',
      invisible: '隐身模式',
      edit_profile: '编辑个人资料通行证',
      change_filter: '筛选订阅',
      change_preference: '更改偏好',
      raffle_ticket: '抽奖券',
      flying_message: '飞行消息',
    },
  },
  'zh-TW': {
    title: '付款紀錄審核',
    privacy: '僅管理員可查看。查詢結果不會傳回付款交易編號。',
    searchPlaceholder: '付款參考號或 Telegram 使用者 ID',
    search: '搜尋',
    refresh: '重新整理',
    loading: '正在載入付款紀錄…',
    loadError: '無法載入付款紀錄，請重試。',
    empty: '找不到付款紀錄。',
    loadMore: '載入更多',
    close: '關閉',
    reference: '付款參考號',
    telegramId: 'Telegram 使用者 ID',
    type: '類型',
    amount: '金額',
    status: '狀態',
    date: '日期 / 時間',
    passLookupTitle: '檢查通行證權限',
    passLookupHint: '可按 Telegram 帳號或付款交易編號搜尋。交易編號只用於比對，不會包含在結果中。',
    passLookupPlaceholder: '輸入 Telegram 使用者 ID 或付款交易編號',
    passLookupByTelegram: 'Telegram 使用者 ID',
    passLookupByCharge: '付款交易編號',
    passLookupProfileMissing: '找不到相符的個人資料。',
    passLookupReceipts: '隱藏年齡 / 隱身付款紀錄',
    passLookupNoReceipts: '找不到相符的通行證付款紀錄。',
    passLookupHideAge: '隱藏年齡',
    passLookupInvisibility: '隱身模式',
    passLookupEnabled: '已啟用',
    passLookupDisabled: '已停用',
    passLookupActive: '有效',
    passLookupInactive: '已失效',
    passLookupGridVisible: '網格可見',
    passLookupGridHidden: '網格已隱藏',
    passLookupExpires: '到期時間',
    passLookupNoExpiry: '沒有到期紀錄',
    passLookupMoreReceipts: '只顯示最近 25 筆紀錄。',
    paid: '已付款',
    fulfilled: '已完成',
    refunded: '已退款',
    rejected: '已拒絕',
    pending: '待處理',
    prechecked: '檢查中',
    cancelled: '已取消',
    failed: '失敗',
    typeLabels: {
      hide_age: '隱藏年齡',
      invisible: '隱身模式',
      edit_profile: '編輯個人資料通行證',
      change_filter: '篩選訂閱',
      change_preference: '更改偏好',
      raffle_ticket: '抽獎券',
      flying_message: '飛行訊息',
    },
  },
  ja: {
    title: '決済の確認',
    privacy: '管理者のみ利用できます。決済チャージ ID は検索結果に返しません。',
    searchPlaceholder: '決済参照番号またはTelegramユーザーID',
    search: '検索',
    refresh: '更新',
    loading: '決済記録を読み込み中…',
    loadError: '決済記録を読み込めませんでした。もう一度お試しください。',
    empty: '決済記録がありません。',
    loadMore: 'さらに表示',
    close: '閉じる',
    reference: '決済参照番号',
    telegramId: 'Telegram ID',
    type: '種類',
    amount: '金額',
    status: '状態',
    date: '日時',
    passLookupTitle: 'パスのアクセスを確認',
    passLookupHint: 'Telegram アカウントまたは決済チャージ ID で検索できます。チャージ ID は照合のみに使用し、結果には含めません。',
    passLookupPlaceholder: 'Telegram ID または決済チャージ ID を入力',
    passLookupByTelegram: 'Telegram ID',
    passLookupByCharge: '決済チャージ ID',
    passLookupProfileMissing: '該当するプロフィールが見つかりません。',
    passLookupReceipts: '年齢非表示 / 非表示モードの決済記録',
    passLookupNoReceipts: '該当するパスの決済記録はありません。',
    passLookupHideAge: '年齢非表示',
    passLookupInvisibility: '非表示モード',
    passLookupEnabled: '有効',
    passLookupDisabled: '無効',
    passLookupActive: '利用中',
    passLookupInactive: '期限切れ',
    passLookupGridVisible: 'グリッドに表示',
    passLookupGridHidden: 'グリッドに非表示',
    passLookupExpires: '有効期限',
    passLookupNoExpiry: '期限の記録なし',
    passLookupMoreReceipts: '最新 25 件のみ表示しています。',
    paid: '支払い済み',
    fulfilled: '完了',
    refunded: '返金済み',
    rejected: '拒否',
    pending: '保留中',
    prechecked: '確認中',
    cancelled: 'キャンセル済み',
    failed: '失敗',
    typeLabels: {
      hide_age: '年齢を非表示',
      invisible: '非表示モード',
      edit_profile: 'プロフィール編集パス',
      change_filter: 'フィルター購読',
      change_preference: '設定変更',
      raffle_ticket: '抽選チケット',
      flying_message: 'フライングメッセージ',
    },
  },
  ko: {
    title: '결제 검토',
    privacy: '관리자만 사용할 수 있습니다. 결제 거래 ID는 검색 결과에 반환되지 않습니다.',
    searchPlaceholder: '결제 참조 번호 또는 Telegram 사용자 ID',
    search: '검색',
    refresh: '새로고침',
    loading: '결제 내역을 불러오는 중…',
    loadError: '결제 내역을 불러오지 못했습니다. 다시 시도하세요.',
    empty: '결제 내역이 없습니다.',
    loadMore: '더 불러오기',
    close: '닫기',
    reference: '결제 참조 번호',
    telegramId: 'Telegram ID',
    type: '유형',
    amount: '금액',
    status: '상태',
    date: '날짜 / 시간',
    passLookupTitle: '패스 이용 권한 확인',
    passLookupHint: 'Telegram 계정 또는 결제 거래 ID로 검색할 수 있습니다. 거래 ID는 검색에만 사용되며 결과에 포함되지 않습니다.',
    passLookupPlaceholder: 'Telegram ID 또는 결제 거래 ID 입력',
    passLookupByTelegram: 'Telegram ID',
    passLookupByCharge: '결제 거래 ID',
    passLookupProfileMissing: '검색 결과 프로필이 없습니다.',
    passLookupReceipts: '나이 숨기기 / 비공개 모드 결제 내역',
    passLookupNoReceipts: '일치하는 패스 결제 내역이 없습니다.',
    passLookupHideAge: '나이 숨기기',
    passLookupInvisibility: '비공개 모드',
    passLookupEnabled: '사용',
    passLookupDisabled: '사용 안 함',
    passLookupActive: '활성',
    passLookupInactive: '비활성',
    passLookupGridVisible: '그리드에 표시',
    passLookupGridHidden: '그리드에서 숨김',
    passLookupExpires: '만료',
    passLookupNoExpiry: '만료 기록 없음',
    passLookupMoreReceipts: '최근 25개 내역만 표시합니다.',
    paid: '결제됨',
    fulfilled: '완료',
    refunded: '환불됨',
    rejected: '거부됨',
    pending: '대기 중',
    prechecked: '확인 중',
    cancelled: '취소됨',
    failed: '실패',
    typeLabels: {
      hide_age: '나이 숨기기',
      invisible: '비공개 모드',
      edit_profile: '프로필 수정 패스',
      change_filter: '필터 구독',
      change_preference: '선호도 변경',
      raffle_ticket: '추첨 티켓',
      flying_message: '플라잉 메시지',
    },
  },
  ru: {
    title: 'Проверка платежей',
    privacy: 'Доступно только администраторам. ID платежей не возвращаются в результатах поиска.',
    searchPlaceholder: 'Номер платежа или ID пользователя Telegram',
    search: 'Найти',
    refresh: 'Обновить',
    loading: 'Загрузка платежей…',
    loadError: 'Не удалось загрузить платежи. Попробуйте ещё раз.',
    empty: 'Записи о платежах не найдены.',
    loadMore: 'Показать ещё',
    close: 'Закрыть',
    reference: 'Номер платежа',
    telegramId: 'ID Telegram',
    type: 'Тип',
    amount: 'Сумма',
    status: 'Статус',
    date: 'Дата и время',
    passLookupTitle: 'Проверить доступ по пропускам',
    passLookupHint: 'Поиск по аккаунту Telegram или ID платежа. ID используется только для сопоставления и не включается в результаты.',
    passLookupPlaceholder: 'Введите Telegram ID или ID платежа',
    passLookupByTelegram: 'ID Telegram',
    passLookupByCharge: 'ID платежа',
    passLookupProfileMissing: 'Профиль не найден.',
    passLookupReceipts: 'Платежи за скрытие возраста / невидимость',
    passLookupNoReceipts: 'Платежи за эти пропуски не найдены.',
    passLookupHideAge: 'Скрытие возраста',
    passLookupInvisibility: 'Невидимость',
    passLookupEnabled: 'Включено',
    passLookupDisabled: 'Выключено',
    passLookupActive: 'Активно',
    passLookupInactive: 'Неактивно',
    passLookupGridVisible: 'Профиль виден в сетке',
    passLookupGridHidden: 'Профиль скрыт в сетке',
    passLookupExpires: 'Истекает',
    passLookupNoExpiry: 'Срок не указан',
    passLookupMoreReceipts: 'Показаны последние 25 записей.',
    paid: 'Оплачено',
    fulfilled: 'Выполнено',
    refunded: 'Возвращено',
    rejected: 'Отклонено',
    pending: 'Ожидает',
    prechecked: 'Проверяется',
    cancelled: 'Отменено',
    failed: 'Не удалось',
    typeLabels: {
      hide_age: 'Скрытие возраста',
      invisible: 'Режим невидимости',
      edit_profile: 'Доступ к редактированию профиля',
      change_filter: 'Подписка на фильтры',
      change_preference: 'Изменение предпочтений',
      raffle_ticket: 'Билет розыгрыша',
      flying_message: 'Летающее сообщение',
    },
  },
};

const rafflePaymentReviewCopy: Record<LangKey, RafflePaymentReviewCopy> = {
  en: {
    title: 'Raffle payment recovery',
    hint: 'Admin-only. Recover a missing ticket from its verified paid receipt, or refund a paid ticket with no issued ticket. No new charge is created.',
    searchPlaceholder: 'Intent reference or Telegram user ID',
    empty: 'No raffle payment intents found.',
    issued: 'Ticket issued',
    missing: 'No ticket issued',
    fulfill: 'Issue missing ticket',
    refund: 'Refund payment',
    confirmRefund: 'This will refund the payment through the bot that received it. Continue?',
    history: 'Recovery history',
    noHistory: 'No recovery actions recorded.',
    actionLabel: { fulfill: 'Issue ticket', refund: 'Refund' },
    statusLabels: {
      in_progress: 'In progress',
      fulfilled: 'Ticket issued',
      already_fulfilled: 'Already issued',
      refunded: 'Refunded',
      failed: 'Failed',
      uncertain: 'Uncertain',
      ineligible: 'Not eligible',
    },
  },
  'zh-CN': {
    title: '抽奖付款恢复',
    hint: '仅管理员可用。可根据已验证的付款记录补发漏发的抽奖券，或退款给已付款但未出票的订单；不会再次扣款。',
    searchPlaceholder: '订单参考号或 Telegram 用户 ID',
    empty: '未找到抽奖付款记录。',
    issued: '已出票',
    missing: '未出票',
    fulfill: '补发抽奖券',
    refund: '退款',
    confirmRefund: '将通过收款的机器人退款。是否继续？',
    history: '恢复记录',
    noHistory: '暂无恢复操作。',
    actionLabel: { fulfill: '补发抽奖券', refund: '退款' },
    statusLabels: {
      in_progress: '处理中',
      fulfilled: '已出票',
      already_fulfilled: '已出票',
      refunded: '已退款',
      failed: '失败',
      uncertain: '结果待确认',
      ineligible: '不符合条件',
    },
  },
  'zh-TW': {
    title: '抽獎付款恢復',
    hint: '僅管理員可用。可根據已驗證的付款紀錄補發漏發的抽獎券，或退款給已付款但未出票的訂單；不會再次扣款。',
    searchPlaceholder: '訂單參考號或 Telegram 使用者 ID',
    empty: '找不到抽獎付款紀錄。',
    issued: '已出票',
    missing: '未出票',
    fulfill: '補發抽獎券',
    refund: '退款',
    confirmRefund: '將透過收款的機器人退款。要繼續嗎？',
    history: '恢復紀錄',
    noHistory: '目前沒有恢復操作。',
    actionLabel: { fulfill: '補發抽獎券', refund: '退款' },
    statusLabels: {
      in_progress: '處理中',
      fulfilled: '已出票',
      already_fulfilled: '已出票',
      refunded: '已退款',
      failed: '失敗',
      uncertain: '結果待確認',
      ineligible: '不符合資格',
    },
  },
  ja: {
    title: '抽選支払いの復旧',
    hint: '管理者専用。確認済みの支払い記録から未発行チケットを復旧するか、未発行の支払いを返金します。再請求は行いません。',
    searchPlaceholder: '注文番号または Telegram ユーザー ID',
    empty: '抽選の支払い記録がありません。',
    issued: 'チケット発行済み',
    missing: 'チケット未発行',
    fulfill: 'チケットを発行',
    refund: '返金',
    confirmRefund: '受け取り元のボットを通じて返金します。続行しますか？',
    history: '復旧履歴',
    noHistory: '復旧操作はありません。',
    actionLabel: { fulfill: 'チケット発行', refund: '返金' },
    statusLabels: {
      in_progress: '処理中',
      fulfilled: '発行済み',
      already_fulfilled: '発行済み',
      refunded: '返金済み',
      failed: '失敗',
      uncertain: '結果未確認',
      ineligible: '対象外',
    },
  },
  ko: {
    title: '추첨 결제 복구',
    hint: '관리자 전용입니다. 확인된 결제 기록으로 누락된 티켓을 복구하거나, 티켓이 발급되지 않은 결제를 환불합니다. 다시 청구하지 않습니다.',
    searchPlaceholder: '주문 참조 또는 Telegram 사용자 ID',
    empty: '추첨 결제 기록이 없습니다.',
    issued: '티켓 발급됨',
    missing: '티켓 미발급',
    fulfill: '누락된 티켓 발급',
    refund: '결제 환불',
    confirmRefund: '결제를 받은 봇을 통해 환불합니다. 계속할까요?',
    history: '복구 기록',
    noHistory: '복구 작업이 없습니다.',
    actionLabel: { fulfill: '티켓 발급', refund: '환불' },
    statusLabels: {
      in_progress: '진행 중',
      fulfilled: '발급됨',
      already_fulfilled: '이미 발급됨',
      refunded: '환불됨',
      failed: '실패',
      uncertain: '결과 확인 필요',
      ineligible: '대상 아님',
    },
  },
  ru: {
    title: 'Восстановление платежей розыгрыша',
    hint: 'Только для администраторов. Можно выдать пропущенный билет по подтверждённой оплате или вернуть оплату без билета. Повторного списания не будет.',
    searchPlaceholder: 'Номер заказа или Telegram ID пользователя',
    empty: 'Платежи розыгрыша не найдены.',
    issued: 'Билет выдан',
    missing: 'Билет не выдан',
    fulfill: 'Выдать пропущенный билет',
    refund: 'Вернуть оплату',
    confirmRefund: 'Оплата будет возвращена через бота, который её получил. Продолжить?',
    history: 'История восстановления',
    noHistory: 'Действий по восстановлению пока нет.',
    actionLabel: { fulfill: 'Выдать билет', refund: 'Возврат' },
    statusLabels: {
      in_progress: 'Выполняется',
      fulfilled: 'Билет выдан',
      already_fulfilled: 'Уже выдан',
      refunded: 'Возвращено',
      failed: 'Ошибка',
      uncertain: 'Результат не подтверждён',
      ineligible: 'Недоступно',
    },
  },
};

function parsePaymentReviewPage(value: unknown): {
  payments: PaymentRecord[];
  hasMore: boolean;
} {
  const page = value as { payments?: unknown; hasMore?: unknown } | null;
  if (!page || !Array.isArray(page.payments) || typeof page.hasMore !== 'boolean') {
    throw new Error('Invalid payment review response');
  }
  const payments = page.payments.map((raw): PaymentRecord => {
    const row = raw as Partial<PaymentRecord> | null;
    if (!row ||
        typeof row.paymentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.paymentId) ||
        typeof row.telegramId !== 'string' ||
        !/^[0-9]{1,20}$/.test(row.telegramId) ||
        typeof row.type !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,47}$/.test(row.type) ||
        (row.amount !== null && (typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount < 0)) ||
        typeof row.currency !== 'string' ||
        !/^[A-Z]{3}$/.test(row.currency) ||
        typeof row.status !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,47}$/.test(row.status) ||
        (row.occurredAt !== null &&
          (typeof row.occurredAt !== 'string' || !Number.isFinite(Date.parse(row.occurredAt))))) {
      throw new Error('Invalid payment review record');
    }
    return {
      paymentId: row.paymentId,
      telegramId: row.telegramId,
      type: row.type,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      occurredAt: row.occurredAt,
    };
  });
  return { payments, hasMore: page.hasMore };
}

const rafflePaymentUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRafflePaymentReviewPage(value: unknown): {
  intents: RafflePaymentReviewIntent[];
  hasMore: boolean;
} {
  const page = value as { intents?: unknown; hasMore?: unknown } | null;
  if (!page || !Array.isArray(page.intents) || typeof page.hasMore !== 'boolean') {
    throw new Error('Invalid raffle recovery response');
  }
  const intents = page.intents.map((raw): RafflePaymentReviewIntent => {
    const row = raw as Partial<RafflePaymentReviewIntent> | null;
    if (!row ||
        typeof row.intentId !== 'string' ||
        !rafflePaymentUuidPattern.test(row.intentId) ||
        typeof row.telegramId !== 'string' ||
        !/^[0-9]{1,20}$/.test(row.telegramId) ||
        (row.bot !== 'botA' && row.bot !== 'botB') ||
        typeof row.status !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,47}$/.test(row.status) ||
        (row.updatedAt !== null &&
          (typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)))) ||
        typeof row.ticketIssued !== 'boolean' ||
        typeof row.canRetryFulfillment !== 'boolean' ||
        typeof row.canRefund !== 'boolean' ||
        !Array.isArray(row.recoveryHistory) ||
        row.recoveryHistory.length > 5 ||
        (row.ticketIssued && (row.canRetryFulfillment || row.canRefund)) ||
        (row.canRetryFulfillment && row.status !== 'paid') ||
        (row.canRefund && !['paid', 'refund_pending'].includes(row.status))) {
      throw new Error('Invalid raffle recovery record');
    }
    const recoveryHistory = row.recoveryHistory.map((rawEvent) => {
      const event = rawEvent as RafflePaymentReviewIntent['recoveryHistory'][number] | null;
      if (!event ||
          (event.action !== 'fulfill' && event.action !== 'refund') ||
          typeof event.status !== 'string' ||
          !/^[a-z][a-z0-9_-]{0,47}$/.test(event.status) ||
          (event.outcome !== null &&
            (typeof event.outcome !== 'string' || event.outcome.length > 140)) ||
          (event.createdAt !== null &&
            (typeof event.createdAt !== 'string' || !Number.isFinite(Date.parse(event.createdAt))))) {
        throw new Error('Invalid raffle recovery history record');
      }
      return {
        action: event.action,
        status: event.status,
        outcome: event.outcome,
        createdAt: event.createdAt,
      };
    });
    return {
      intentId: row.intentId,
      telegramId: row.telegramId,
      bot: row.bot,
      status: row.status,
      updatedAt: row.updatedAt,
      ticketIssued: row.ticketIssued,
      canRetryFulfillment: row.canRetryFulfillment,
      canRefund: row.canRefund,
      recoveryHistory,
    };
  });
  return { intents, hasMore: page.hasMore };
}

function parseRaffleRecoveryResult(value: unknown): {
  requestId: string;
  action: 'fulfill' | 'refund';
  status: string;
  outcome: string | null;
} {
  const result = value as {
    requestId?: unknown;
    action?: unknown;
    status?: unknown;
    outcome?: unknown;
  } | null;
  if (!result ||
      typeof result.requestId !== 'string' ||
      !rafflePaymentUuidPattern.test(result.requestId) ||
      (result.action !== 'fulfill' && result.action !== 'refund') ||
      typeof result.status !== 'string' ||
      !['in_progress', 'fulfilled', 'already_fulfilled', 'refunded', 'failed', 'uncertain', 'ineligible'].includes(result.status) ||
      (result.outcome !== null &&
        (typeof result.outcome !== 'string' || result.outcome.length > 140))) {
    throw new Error('Invalid raffle recovery result');
  }
  return {
    requestId: result.requestId,
    action: result.action,
    status: result.status,
    outcome: result.outcome,
  };
}

function parsePassPaymentLookup(value: unknown): PassPaymentLookup {
  const result = value as Partial<PassPaymentLookup> | null;
  if (!result ||
      (result.telegramId !== null &&
        (typeof result.telegramId !== 'string' || !/^[0-9]{1,20}$/.test(result.telegramId))) ||
      !Array.isArray(result.receipts) ||
      typeof result.hasMore !== 'boolean' ||
      (result.currentAccess !== null && typeof result.currentAccess !== 'object')) {
    throw new Error('Invalid pass payment lookup response');
  }

  const receipts = result.receipts.map((raw): PassPaymentLookup['receipts'][number] => {
    const receipt = raw as Partial<PassPaymentLookup['receipts'][number]> | null;
    if (!receipt ||
        typeof receipt.paymentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.paymentId) ||
        typeof receipt.telegramId !== 'string' ||
        !/^[0-9]{1,20}$/.test(receipt.telegramId) ||
        (receipt.product !== 'hide_age' && receipt.product !== 'invisible') ||
        typeof receipt.amount !== 'number' ||
        !Number.isSafeInteger(receipt.amount) ||
        receipt.amount < 0 ||
        typeof receipt.currency !== 'string' ||
        !/^[A-Z]{3}$/.test(receipt.currency) ||
        typeof receipt.status !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,47}$/.test(receipt.status) ||
        (receipt.occurredAt !== null &&
          (typeof receipt.occurredAt !== 'string' ||
            !Number.isFinite(Date.parse(receipt.occurredAt))))) {
      throw new Error('Invalid pass payment receipt');
    }
    return {
      paymentId: receipt.paymentId,
      telegramId: receipt.telegramId,
      product: receipt.product,
      amount: receipt.amount,
      currency: receipt.currency,
      status: receipt.status,
      occurredAt: receipt.occurredAt,
    };
  });

  let currentAccess: PassPaymentLookup['currentAccess'] = null;
  if (result.currentAccess !== null) {
    const access = result.currentAccess as PassPaymentLookup['currentAccess'];
    const validExpiry = (expiry: unknown): expiry is string | null =>
      expiry === null ||
      (typeof expiry === 'string' && Number.isFinite(Date.parse(expiry)));
    if (!access ||
        typeof access.hideAge?.enabled !== 'boolean' ||
        typeof access.hideAge?.active !== 'boolean' ||
        !validExpiry(access.hideAge?.expiresAt) ||
        typeof access.invisibility?.gridVisible !== 'boolean' ||
        typeof access.invisibility?.active !== 'boolean' ||
        !validExpiry(access.invisibility?.expiresAt)) {
      throw new Error('Invalid current pass access state');
    }
    currentAccess = {
      hideAge: {
        enabled: access.hideAge.enabled,
        active: access.hideAge.active,
        expiresAt: access.hideAge.expiresAt,
      },
      invisibility: {
        gridVisible: access.invisibility.gridVisible,
        active: access.invisibility.active,
        expiresAt: access.invisibility.expiresAt,
      },
    };
  }

  return {
    telegramId: result.telegramId ?? null,
    receipts,
    hasMore: result.hasMore,
    currentAccess,
  };
}

const flyingMessageCopy: Record<LangKey, FlyingMessageCopy> = {
  en: {
    placeholder: 'Send a flying message…', send: 'Send', free: 'FREE',
    priceLabel: 'Flying message price (Stars)', save: 'Save', sending: 'Sending…',
    cooldown: 'Send again in {seconds}s', invoiceFallback: 'Complete the invoice in Telegram. Your message appears after payment is confirmed.',
    paymentProcessing: 'Payment received; your message is still being confirmed.',
    paymentRefunded: 'Your payment was refunded. No message was sent; your draft is still here.',
    paymentRejected: 'The payment was rejected. No message was sent; your draft is still here.',
    dismiss: 'Dismiss',
  },
  'zh-CN': {
    placeholder: '发送飞行消息…', send: '发送', free: '免费',
    priceLabel: '飞行消息价格（Stars）', save: '保存', sending: '发送中…',
    cooldown: '{seconds} 秒后可再次发送', invoiceFallback: '请在 Telegram 中完成付款。确认付款后消息将显示。',
    paymentProcessing: '已收到付款，正在确认您的消息。',
    paymentRefunded: '付款已退款。消息未发送，草稿仍保留在输入框中。',
    paymentRejected: '付款未获接受。消息未发送，草稿仍保留在输入框中。',
    dismiss: '关闭',
  },
  'zh-TW': {
    placeholder: '傳送飛行訊息…', send: '傳送', free: '免費',
    priceLabel: '飛行訊息價格（Stars）', save: '儲存', sending: '傳送中…',
    cooldown: '{seconds} 秒後可再次傳送', invoiceFallback: '請在 Telegram 中完成付款。確認付款後訊息將顯示。',
    paymentProcessing: '已收到付款，正在確認您的訊息。',
    paymentRefunded: '款項已退款。訊息未傳送，草稿仍保留在輸入框中。',
    paymentRejected: '付款未獲接受。訊息未傳送，草稿仍保留在輸入框中。',
    dismiss: '關閉',
  },
  ja: {
    placeholder: 'フライングメッセージを送信…', send: '送信', free: '無料',
    priceLabel: 'フライングメッセージの料金（Stars）', save: '保存', sending: '送信中…',
    cooldown: 'あと {seconds} 秒で送信できます', invoiceFallback: 'Telegramで支払いを完了してください。決済確認後にメッセージが表示されます。',
    paymentProcessing: '支払いを受け付けました。メッセージを確認中です。',
    paymentRefunded: 'お支払いは返金されました。メッセージは送信されず、下書きは入力欄に残っています。',
    paymentRejected: '決済は受け付けられませんでした。メッセージは送信されず、下書きは入力欄に残っています。',
    dismiss: '閉じる',
  },
  ko: {
    placeholder: '플라잉 메시지 보내기…', send: '보내기', free: '무료',
    priceLabel: '플라잉 메시지 가격(Stars)', save: '저장', sending: '전송 중…',
    cooldown: '{seconds}초 후 다시 보낼 수 있습니다', invoiceFallback: 'Telegram에서 결제를 완료하세요. 결제가 확인되면 메시지가 표시됩니다.',
    paymentProcessing: '결제가 접수되었습니다. 메시지를 확인 중입니다.',
    paymentRefunded: '결제가 환불되었습니다. 메시지는 전송되지 않았으며 초안은 입력란에 남아 있습니다.',
    paymentRejected: '결제가 거부되었습니다. 메시지는 전송되지 않았으며 초안은 입력란에 남아 있습니다.',
    dismiss: '닫기',
  },
  ru: {
    placeholder: 'Отправить летящее сообщение…', send: 'Отправить', free: 'БЕСПЛАТНО',
    priceLabel: 'Цена сообщения (Stars)', save: 'Сохранить', sending: 'Отправка…',
    cooldown: 'Повторная отправка через {seconds} с', invoiceFallback: 'Завершите оплату в Telegram. Сообщение появится после подтверждения.',
    paymentProcessing: 'Оплата получена, сообщение ещё подтверждается.',
    paymentRefunded: 'Оплата возвращена. Сообщение не отправлено; черновик остался в поле ввода.',
    paymentRejected: 'Платёж отклонён. Сообщение не отправлено; черновик остался в поле ввода.',
    dismiss: 'Закрыть',
  },
};

const translations: Record<LangKey, Record<string, string>> = {
  'en': {
    period_1d: '1 day', period_3d: '3 days',
    loading: 'Loading app...', locationRequired: 'Location Access Required', locationMessage: "Location permission is mandatory to use Who's Nearby. Please enable location access in your browser or Telegram settings and restart the app.", accessDenied: 'Access Denied', underageMessage: 'The app is for adults only. Access has been locked for this account due to age restrictions.', completeProfile: 'Complete Your Profile', profileWarning: 'Warning: This cannot be changed in the future. Information entered here affects who you can see and interact with.', dob: 'Date of Birth:', imA: "I'm a", seeking: 'seeking', man: 'man', woman: 'woman', nonBinary: 'non-binary', men: 'men', women: 'women', everyone: 'everyone', height: 'Height:', selectHeight: 'Select height', weight: 'Weight:', selectWeight: 'Select weight', tapToChange: 'tap to change your preference:', mode: 'Mode:', browsingOnly: 'Browsing only - You cannot send not receive private message from others', onlineOnly: 'Online only - You are visible on grid but not on map, map is inaccessible', meetUp: 'Meet up - You are visible on grid and map', saveProfile: 'Save Profile & Continue', whosNearby: "Who's Nearby", filter: 'Filter', refresh: 'Refresh', grid: 'Grid', chat: 'Chat', map: 'Map', wallet: 'Wallet', filterUsers: 'Filter Users', ageRange: 'Age Range', preferenceMatcher: 'Preference Matcher', rolePreference: 'Role Preference', safetyPreference: 'Safety Preference', playstylePreference: 'Playstyle Preference', groupSize: 'Group Size', applyFilters: 'Apply Filters', ageHidden: 'Age Hidden (Click to Show)', ageShown: 'Age Shown (Click to Hide)', expires: 'Expires:', sendMessage: 'Send Message', unlockPreference: 'Change Profile & Preferences', iGotStuff: 'I got stuff', unlockPreferencePrompt: 'Changing your profile/preferences requires a one-time payment of 1000 Telegram Stars. Proceed to payment?', invisiblePrompt: 'Going invisible requires a 30-day subscription for 3000 Telegram Stars. Proceed to payment?', hideAgePrompt: 'Hiding your age for 30 days costs 1000 Telegram Stars. Proceed to payment?', filterSubPrompt: 'Customizing this filter requires a subscription. Proceed to payment?', paymentCancelled: 'Payment was cancelled or failed.', paymentProcessing: 'Payment received; access is still updating. Please refresh shortly.', errorSaving: 'Error saving profile:', fillAll: 'Please fill in all required questions to continue.',
    'Versatile': 'Versatile', 'Top': 'Top', 'Bottom': 'Bottom', 'Side': 'Side', 'VT': 'Vers / Top', 'VB': 'Vers / Bottom',
    'Safe': 'Safe (Condoms)', 'Raw': 'Raw (Bareback)',
    'Clean': 'No Drugs', 'Party': 'Party (Chemsex)', 'Party✓': 'Party✓',
    '1on1_setup': '1-on-1 (only)', 'group_setup': 'group (only)', 'DoesntMatter_setup': "Doesn't matter",
    '1on1': '1-on-1', 'group': 'group', 'DoesntMatter': "Doesn't matter",
    'Host': 'Host', 'Travel': 'Travel', 'Off': 'Off', 'Anywhere': 'Anywhere', 'Role': 'Role', 'Safety': 'Safety', 'Playstyle': 'Playstyle', 'How Many': 'How Many', 'Where': 'Where',
    you: 'You', away: 'away', online: 'Online', offline: 'Offline',
    mAgo: '{n}m ago', hAgo: '{n}h ago', dAgo: '{n}d ago',
    m2m: 'M2M', admin: 'Admin', unsubscribed: 'Unsubscribed',
    subscribedUntil: 'Subscribed until {d}', expired: 'Expired',
    privateNote: 'Private note', notePlaceholder: 'Private note (100 chars max)',
    forceReset: 'Force reset', gamesApps: 'Games & Apps', resetProfile: 'Reset Profile',
    selectedUser: 'Selected user: {n}', profileReset: 'Profile reset.', resetFailed: 'Reset failed.',
    forceResetConfirm: 'Force reset profile of {n}?',
    vip: 'VIP', vipUnlimited: 'VIP · ∞', adminMenu: 'Admin Menu', adminVipList: 'Admin / VIP List', profileSetupPreview: 'Preview profile setup', owner: 'Owner', addRole: 'Add', removeRole: 'Remove', roleUsernamePlaceholder: 'username (without @)', roleUpdateFailed: 'Update failed.', ownerImmutable: 'The owner role cannot be changed.', noRolesYet: 'No admins or VIPs yet.', close: 'Close', grantVipAll: 'Grant VIP to all', revokeVipAll: 'Revoke VIP for all', forceResetAll: 'Force reset all users', forceResetAllConfirm: 'Reset ALL users? Everyone will see the "complete your info" screen on next login.', resetAllDone: 'All users reset.', period_1w: '1 week', period_1mo: '1 month', period_3mo: '3 months', period_6mo: '6 months', period_1y: '1 year'
  },
  'zh-CN': {
    period_1d: '1 天', period_3d: '3 天',
    loading: '正在加载应用...', locationRequired: '需要位置权限', locationMessage: '使用"附近"功能必须获得位置权限。请在浏览器或 Telegram 设置中启用位置访问并重新启动应用。', accessDenied: '拒绝访问', underageMessage: '本应用仅限成年人使用。由于年龄限制，该账户已被锁定。', completeProfile: '完善您的个人资料', profileWarning: '警告：此信息将来无法更改。此处填写的内容会影响您可以看到和互动的用户。', dob: '出生日期：', imA: '我是', seeking: '寻找', man: '男性', woman: '女性', nonBinary: '非二元性别', men: '男性', women: '女性', everyone: '所有人', height: '身高：', selectHeight: '选择身高', weight: '体重：', selectWeight: '选择体重', tapToChange: '点击更改您的偏好：', mode: '模式：', browsingOnly: '仅浏览', onlineOnly: '仅在线', meetUp: '约会中', saveProfile: '保存资料并继续', whosNearby: '附近的人', filter: '筛选', refresh: '刷新', grid: '网格', chat: '聊天', map: '地图', wallet: '钱包', filterUsers: '筛选用户', ageRange: '年龄范围', preferenceMatcher: '偏好匹配器', rolePreference: '角色偏好', safetyPreference: '安全偏好', playstylePreference: '游戏风格偏好', groupSize: '群组人数', applyFilters: '应用筛选', ageHidden: '年龄已隐藏', ageShown: '年龄已显示', expires: '到期时间：', sendMessage: '发送消息', unlockPreference: '更改资料与偏好', iGotStuff: '我有货', unlockPreferencePrompt: '更改个人资料与偏好需要支付 1000 Telegram Stars。是否继续支付？', invisiblePrompt: '隐身需要订阅 30 天，费用为 3000 Telegram Stars。是否继续支付？', hideAgePrompt: '隐藏年龄需要订阅 30 天，费用为 1000 Telegram Stars。是否继续支付？', filterSubPrompt: '自定义此筛选条件需要订阅。是否继续支付？', paymentCancelled: '支付已取消或失败。', errorSaving: '保存资料出错：', fillAll: '请填写所有必填问题以继续。',
    'Versatile': '0.5 (可攻可受)', 'Top': '1 (攻)', 'Bottom': '0 (受)', 'Side': 'Side (边缘)', 'VT': '可攻可受 / 攻', 'VB': '可攻可受 / 受',
    'Safe': 'Safe (戴套)', 'Raw': 'Raw (无套)',
    'Clean': '不使用毒品', 'Party': 'Party (嗨药)', 'Party✓': 'Party✓',
    '1on1_setup': '单对单 (仅限1on1)', 'group_setup': '群组 (仅限群组)', 'DoesntMatter_setup': '无所谓',
    '1on1': '一对一', 'group': '群组', 'DoesntMatter': '无所谓',
    'Host': '提供场地 (Host)', 'Travel': '上门 (Travel)', 'Off': '关闭', 'Anywhere': '任意', 'Role': '角色', 'Safety': '安全', 'Playstyle': '风格', 'How Many': '人数', 'Where': '地点',
    you: '你', away: '远', online: '在线', offline: '离线',
    mAgo: '{n}分钟前', hAgo: '{n}小时前', dAgo: '{n}天前',
    m2m: '男找男 (M2M)', admin: '管理员', unsubscribed: '未订阅',
    subscribedUntil: '已订阅至 {d}', expired: '已过期',
    privateNote: '私密备注', notePlaceholder: '私密备注 (最多100字)',
    forceReset: '强制重置', gamesApps: '游戏和应用',
    selectedUser: '��选中用户: {n}', profileReset: '资料已重置。', resetFailed: '重置失败。',
    forceResetConfirm: '强制重置 {n} 的资料？',
    vip: 'VIP', vipUnlimited: 'VIP · ∞', adminMenu: '管理菜单', adminVipList: '管理员 / VIP 列表', profileSetupPreview: '预览资料设置', owner: '拥有者', addRole: '添加', removeRole: '移除', roleUsernamePlaceholder: '用户名（不含 @）', roleUpdateFailed: '更新失败。', ownerImmutable: '拥有者角色无法更改。', noRolesYet: '暂无管理员或 VIP。', close: '关闭', grantVipAll: '为所有用户授予 VIP', revokeVipAll: '取消所有用户 VIP', forceResetAll: '强制重置所有用户', forceResetAllConfirm: '重置所有用户？所有人下次登录时都会看到"完善资料"页面。', resetAllDone: '所有用户已重置。', period_1w: '1 周', period_1mo: '1 个月', period_3mo: '3 个月', period_6mo: '6 个月', period_1y: '1 年'
  },
  'zh-TW': {
    period_1d: '1 天', period_3d: '3 天',
    loading: '正在載入應用程式...', locationRequired: '需要位置權限', locationMessage: '使用「附近」功能必須獲得位置權限。請在瀏覽器或 Telegram 設定中啟用位置存取並重新啟動應用程式。', accessDenied: '存取被拒', underageMessage: '本應用程式僅限成年人使用。由於年齡限制，該帳戶已被鎖定。', completeProfile: '完善您的個人資料', profileWarning: '警告：此資訊未來無法更改。此處填寫的內容會影響您可以看到和互動的使用者。', dob: '出生日期：', imA: '我是', seeking: '尋找', man: '男性', woman: '女性', nonBinary: '非二元性別', men: '男性', women: '女性', everyone: '所有人', height: '身高：', selectHeight: '選擇身高', weight: '體重：', selectWeight: '選擇體重', tapToChange: '點擊更改您的偏好：', mode: '模式：', browsingOnly: '僅瀏覽', onlineOnly: '僅線上', meetUp: '見面中', saveProfile: '儲存資料並繼續', whosNearby: '附近的人', filter: '篩選', refresh: '重新整理', grid: '網格', chat: '聊天', map: '地圖', wallet: '錢包', filterUsers: '篩選使用者', ageRange: '年齡範圍', preferenceMatcher: '偏好匹配器', rolePreference: '角色偏好', safetyPreference: '安全偏好', playstylePreference: '風格偏好', groupSize: '群組人數', applyFilters: '套用篩選', ageHidden: '年齡已隱藏', ageShown: '年齡已顯示', expires: '到期時間：', sendMessage: '傳送訊息', unlockPreference: '更改資料與偏好', iGotStuff: '我有貨', unlockPreferencePrompt: '更改個人資料與偏好需要支付 1000 Telegram Stars。是否繼續支付？', invisiblePrompt: '隱身需要訂閱 30 天，費用為 3000 Telegram Stars。是否繼續支付？', hideAgePrompt: '隱藏年齡需要訂閱 30 天，費用為 1000 Telegram Stars。是否繼續支付？', filterSubPrompt: '自訂此篩選條件需要訂閱。是否繼續支付？', paymentCancelled: '付款已取消或失敗。', errorSaving: '儲存資料出錯：', fillAll: '請填寫所有必填問題以繼續。',
    'Versatile': '0.5 (不分)', 'Top': '1 (頂)', 'Bottom': '0 (底)', 'Side': 'Side (邊緣)', 'VT': '不分 / 頂', 'VB': '不分 / 底',
    'Safe': 'Safe (戴套)', 'Raw': 'Raw (無套)',
    'Clean': '不使用毒品', 'Party': 'Party (嗨藥/煙)', 'Party✓': 'Party✓',
    '1on1_setup': '單對單 (僅限1on1)', 'group_setup': '群組 (僅限群組)', 'DoesntMatter_setup': '無所謂',
    '1on1': '單對單', 'group': '群組', 'DoesntMatter': '無所謂',
    'Host': '提供場地 (Host)', 'Travel': '上門 (Travel)', 'Off': '關閉', 'Anywhere': '任意', 'Role': '角色', 'Safety': '安全', 'Playstyle': '風格', 'How Many': '人數', 'Where': '地點',
    you: '你', away: '遠', online: '在線', offline: '離線',
    mAgo: '{n}分鐘前', hAgo: '{n}小時前', dAgo: '{n}天前',
    m2m: '男找男 (M2M)', admin: '管理員', unsubscribed: '未訂閱',
    subscribedUntil: '已訂閱至 {d}', expired: '已過期',
    privateNote: '私密備註', notePlaceholder: '私密備註 (最多100字)',
    forceReset: '強制重置', gamesApps: '遊戲和應用',
    selectedUser: '已選中用戶: {n}', profileReset: '資料已重置。', resetFailed: '重置失敗。',
    forceResetConfirm: '強制重置 {n} 的資料？',
    vip: 'VIP', vipUnlimited: 'VIP · ∞', adminMenu: '管理選單', adminVipList: '管理員 / VIP 列表', profileSetupPreview: '預覽資料設定', owner: '擁有者', addRole: '新增', removeRole: '移除', roleUsernamePlaceholder: '用戶名（不含 @）', roleUpdateFailed: '更新失敗。', ownerImmutable: '擁有者角色無法更改。', noRolesYet: '暫無管理員或 VIP。', close: '關閉', grantVipAll: '為所有用戶授予 VIP', revokeVipAll: '取消所有用戶 VIP', forceResetAll: '強制重置所有用戶', forceResetAllConfirm: '重置所有用戶？所有人下次登入時都會看到「完善資料」頁面。', resetAllDone: '所有用戶已重置。', period_1w: '1 週', period_1mo: '1 個月', period_3mo: '3 個月', period_6mo: '6 個月', period_1y: '1 年'
  },
  'ja': {
    period_1d: '1 日', period_3d: '3 日',
    loading: 'アプリを読み込んでいます...', locationRequired: '位置情報のアクセスが必要です', locationMessage: '位置情報の許可が必須です。ブラウザまたは Telegram の設定で位置情報を有効にし、アプリを再起動してください。', accessDenied: 'アクセスが拒否されました', underageMessage: 'このアプリは成人向けです。年齢制限により、このアカウントのアクセスはロックされました。', completeProfile: 'プロフィールを完成させる', profileWarning: '警告：これは後から変更できません。ここで入力した情報は、表示・交流できる相手に影響します。', dob: '生年月日：', imA: '私は', seeking: '探しています：', man: '男性', woman: '女性', nonBinary: 'ノンバイナリー', men: '男性', women: '女性', everyone: 'すべての人', height: '身長：', selectHeight: '身長を選択', weight: '体重：', selectWeight: '体重を選択', tapToChange: 'タップして好みを変更：', mode: 'モード：', browsingOnly: '閲覧のみ', onlineOnly: 'オンラインのみ', meetUp: 'ミートアップ', saveProfile: 'プロフィールを保存して続ける', whosNearby: '近くの人', filter: 'フィルター', refresh: '更新', grid: 'グリッド', chat: 'チャット', map: 'マップ', wallet: 'ウォレット', filterUsers: 'ユーザーをフィルター', ageRange: '年齢層', preferenceMatcher: '好みマッチング', rolePreference: 'ロールの好み', safetyPreference: '安全の好み', playstylePreference: 'プレイスタイルの好み', groupSize: 'グループサイズ', applyFilters: 'フィルターを適用', ageHidden: '年齢非表示', ageShown: '年齢表示', expires: '有効期限：', sendMessage: 'メッセージを送る', unlockPreference: 'プロフィールと好みを変更', iGotStuff: '持ってるよ', unlockPreferencePrompt: 'プロフィールの変更には1000 Starsが必要です。', invisiblePrompt: '透明化には3000 Starsが必要です。', hideAgePrompt: '年齢非表示には1000 Starsが必要です。', filterSubPrompt: 'フィルターのカスタマイズにはサブスクリプションが必要です。', paymentCancelled: '支払いがキャンセルされました。', errorSaving: 'エラー：', fillAll: 'すべての必須項目を入力してください。',
    'Versatile': 'リバ (Vers)', 'Top': 'タチ (Top)', 'Bottom': 'ネコ (Btm)', 'Side': 'サイド (Side)', 'VT': 'リバ/タチ (VT)', 'VB': 'リバ/ネコ (VB)',
    'Safe': 'ゴムあり (Safe)', 'Raw': '生/中出し (Raw)',
    'Clean': '薬物なし', 'Party': 'ケミ (Party)', 'Party✓': 'Party✓',
    '1on1_setup': '1対1のみ', 'group_setup': 'グループのみ', 'DoesntMatter_setup': 'こだわらない',
    '1on1': '1対1', 'group': 'グループ', 'DoesntMatter': 'こだわらない',
    'Host': '部屋あり (Host)', 'Travel': '訪問 (Travel)', 'Off': 'オフ', 'Anywhere': 'どこでも', 'Role': '役割', 'Safety': '安全', 'Playstyle': 'スタイル', 'How Many': '人数', 'Where': '場所',
    you: 'あなた', away: '先', online: 'オンライン', offline: 'オフライン',
    mAgo: '{n}分前', hAgo: '{n}時間前', dAgo: '{n}日前',
    m2m: '男×男 (M2M)', admin: '管理者', unsubscribed: '未購読',
    subscribedUntil: '購読期限: {d}', expired: '期限切れ',
    privateNote: 'プライベートメモ', notePlaceholder: 'プライベートメモ (最大100文���)',
    forceReset: '強制リセット', gamesApps: 'ゲーム&アプリ',
    selectedUser: '選択したユーザー: {n}', profileReset: 'プロフィールをリセットしました。', resetFailed: 'リセットに失敗しま��た。',
    forceResetConfirm: '{n} のプロフィールを強制リセットしますか？',
    vip: 'VIP', vipUnlimited: 'VIP · ∞', adminMenu: '管理メニュー', adminVipList: '管理者 / VIP リスト', profileSetupPreview: 'プロフィール設定をプレビュー', owner: 'オーナー', addRole: '追加', removeRole: '削除', roleUsernamePlaceholder: 'ユーザー名（@なし）', roleUpdateFailed: '更新に失敗しました。', ownerImmutable: 'オーナー権限は変更できません。', noRolesYet: '管理者または VIP はまだいません。', close: '閉じる', grantVipAll: '全ユーザーに VIP を付与', revokeVipAll: '全ユーザーの VIP を取消', forceResetAll: '全ユーザーを強制リセット', forceResetAllConfirm: '全ユーザーをリセットしますか？全員が次回ログイン時に「情報入力」画面を見ます。', resetAllDone: '全ユーザーをリセットしました。', period_1w: '1 週間', period_1mo: '1 か月', period_3mo: '3 か月', period_6mo: '6 か月', period_1y: '1 年'
  },
  'ko': {
    period_1d: '1일', period_3d: '3일',
    loading: '앱 로딩 중...', locationRequired: '위치 접근 권한 필요', locationMessage: '위치 권한이 필수입니다. 브라우저 또는 Telegram 설정에서 위치 접근을 허용하고 앱을 다시 시작하세요.', accessDenied: '접근 거부됨', underageMessage: '이 앱은 성인 전용입니다. 연령 제한으로 이 계정은 잠겼습니다.', completeProfile: '프로필 완성하기', profileWarning: '경고: 이는 나중에 변경할 수 없습니다. 여기 입력한 정보는 볼 수 있고 상호작용할 수 있는 상대에게 영향을 줍니다.', dob: '생년월일:', imA: '나는', seeking: '찾는 대상:', man: '남성', woman: '여성', nonBinary: '논바이너리', men: '남성', women: '여성', everyone: '모두', height: '키:', selectHeight: '키 선택', weight: '체중:', selectWeight: '체중 선택', tapToChange: '탭하여 선호도 변경:', mode: '모드:', browsingOnly: '브라우징 전용', onlineOnly: '온라인 전용', meetUp: '만남', saveProfile: '프로필 저장 및 계속', whosNearby: '내 주변', filter: '필터', refresh: '새로고침', grid: '그리드', chat: '채팅', map: '지도', wallet: '지갑', filterUsers: '사용자 필터', ageRange: '연령대', preferenceMatcher: '취향 매칭', rolePreference: '포지션 선호', safetyPreference: '안전 선호', playstylePreference: '플레이스타일 선호', groupSize: '그룹 인원', applyFilters: '필터 적용', ageHidden: '나이 숨김', ageShown: '나이 표시', expires: '만료일:', sendMessage: '메시지 보내기', unlockPreference: '프로필 변경', iGotStuff: '나 있음', unlockPreferencePrompt: '프로필 변경 1000 Stars 결제?', invisiblePrompt: '숨김 모드 3000 Stars 결제?', hideAgePrompt: '나이 숨기기 1000 Stars 결제?', filterSubPrompt: '필터 변경 구독 필요.', paymentCancelled: '결제 취소됨.', errorSaving: '오류:', fillAll: '필수 항목을 입력해주세요.',
    'Versatile': '올 (Vers)', 'Top': '탑 (Top)', 'Bottom': '바텀 (Btm)', 'Side': '사이드 (Side)', 'VT': '버스/탑 (VT)', 'VB': '버스/바텀 (VB)',
    'Safe': '안전/콘돔 (Safe)', 'Raw': '노콘 (Raw)',
    'Clean': '약물 사용 안 함', 'Party': '파티/약 (Party)', 'Party✓': 'Party✓',
    '1on1_setup': '1대1 (전용)', 'group_setup': '그룹 (전용)', 'DoesntMatter_setup': '상관없음',
    '1on1': '1대1', 'group': '그룹', 'DoesntMatter': '상관없음',
    'Host': '호스트 (방 있음)', 'Travel': '이동가능 (Travel)', 'Off': '꺼짐', 'Anywhere': '상관없음', 'Role': '포지션', 'Safety': '안전', 'Playstyle': '스타일', 'How Many': '인원', 'Where': '장소',
    you: '나', away: '거리', online: '온라인', offline: '오프라인',
    mAgo: '{n}분 전', hAgo: '{n}시간 전', dAgo: '{n}일 전',
    m2m: '남↔남 (M2M)', admin: '관리자', unsubscribed: '미구독',
    subscribedUntil: '구독 만료: {d}', expired: '만료됨',
    privateNote: '개인 메모', notePlaceholder: '개인 메모 (최대 100자)',
    forceReset: '강제 초기화', gamesApps: '게임 & 앱',
    selectedUser: '선택한 사용자: {n}', profileReset: '프로필이 초기화되었습니다.', resetFailed: '초기화에 실패했습니다.',
    forceResetConfirm: '{n} 님의 프로필을 강제 초기화할까요?',
    vip: 'VIP', vipUnlimited: 'VIP · ∞', adminMenu: '관리자 메뉴', adminVipList: '관리자 / VIP 목록', profileSetupPreview: '프로필 설정 미리보기', owner: '소유자', addRole: '추가', removeRole: '삭제', roleUsernamePlaceholder: '사용자명 (@ 제외)', roleUpdateFailed: '업데이트 실패.', ownerImmutable: '소유자 권한은 변경할 수 없습니다.', noRolesYet: '아직 관리자나 VIP가 없습니다.', close: '닫기', grantVipAll: '모든 사용자에게 VIP 부여', revokeVipAll: '모든 사용자 VIP 해제', forceResetAll: '모든 사용자 강제 초기화', forceResetAllConfirm: '모든 사용자를 초기화할까요? 모두 다음 로그인 시 "정보 입력" 화면을 보게 됩니다.', resetAllDone: '모든 사용자가 초기화되었습니다.', period_1w: '1주', period_1mo: '1개월', period_3mo: '3개월', period_6mo: '6개월', period_1y: '1년'
  },
  'ru': {
    period_1d: '1 день', period_3d: '3 дня',
    loading: 'Загрузка...', locationRequired: 'Требуется геолокация', locationMessage: 'Разрешение на геолокацию обязательно. Включите доступ к местоположению в браузере или настройках Telegram и перезапустите приложение.', accessDenied: 'Доступ запрещен', underageMessage: 'Приложение только для взрослых. Доступ к этому аккаунту заблокирован из-за возрастных ограничений.', completeProfile: 'Заполните профиль', profileWarning: 'Предупреждение: это нельзя изменить. Введённые здесь данные влияют на то, кого вы видите и с кем взаимодействуете.', dob: 'Дата рождения:', imA: 'Я', seeking: 'ищу', man: 'мужчину', woman: 'женщину', nonBinary: 'небинарную', men: 'мужчин', women: 'женщин', everyone: 'всех', height: 'Рост:', selectHeight: 'Выберите рост', weight: 'Вес:', selectWeight: 'Выберите вес', tapToChange: 'нажмите, чтобы изменить:', mode: 'Режим:', browsingOnly: 'Только просмотр', onlineOnly: 'Только онлайн', meetUp: 'Встреча', saveProfile: 'Сохранить', whosNearby: 'Рядом', filter: 'Фильтр', refresh: 'Обновить', grid: 'Сетка', chat: 'Чат', map: 'Карта', wallet: 'Кошелек', filterUsers: 'Фильтры', ageRange: 'Возраст', preferenceMatcher: 'Подбор по предпочтениям', rolePreference: 'Роль', safetyPreference: 'Безопасность', playstylePreference: 'Стиль', groupSize: 'Размер группы', applyFilters: 'Применить', ageHidden: 'Возраст скрыт', ageShown: 'Возраст виден', expires: 'Истекает:', sendMessage: 'Сообщение', unlockPreference: 'Изменить профиль', iGotStuff: 'У меня есть стафф', unlockPreferencePrompt: 'Изменить профиль за 1000 Stars?', invisiblePrompt: 'Невидимка за 3000 Stars?', hideAgePrompt: 'Скрыть возраст за 1000 Stars?', filterSubPrompt: 'Требуется подписка на фильтры.', paymentCancelled: 'Оплата отменена.', errorSaving: 'Ошибка:', fillAll: 'Заполните все поля.',
    'Versatile': 'Универсал (Vers)', 'Top': 'Актив (Top)', 'Bottom': 'Пассив (Btm)', 'Side': 'Без пенетрации (Side)', 'VT': 'Универсал/Актив (VT)', 'VB': 'Универсал/Пассив (VB)',
    'Safe': 'С резинкой (Safe)', 'Raw': 'Без резинки (Raw)',
    'Clean': 'Без наркотиков', 'Party': 'Химсекс (Party)', 'Party✓': 'Party✓',
    '1on1_setup': '1 на 1 (только)', 'group_setup': 'группа (только)', 'DoesntMatter_setup': 'Неважно',
    '1on1': '1 на 1', 'group': 'группа', 'DoesntMatter': 'Неважно',
    'Host': 'Принимаю (Host)', 'Travel': 'Приеду (Travel)', 'Off': 'Выкл', 'Anywhere': 'Везде', 'Role': 'Роль', 'Safety': 'Безопасность', 'Playstyle': 'Стиль', 'How Many': 'Сколько', 'Where': 'Где',
    you: 'Вы', away: 'от вас', online: 'Онлайн', offline: 'Офлайн',
    mAgo: '{n} мин назад', hAgo: '{n} ч назад', dAgo: '{n} дн назад',
    m2m: 'М+М (M2M)', admin: 'Админ', unsubscribed: 'Без подписки',
    subscribedUntil: 'Подписка до {d}', expired: 'Истекла',
    privateNote: 'Личная заметка', notePlaceholder: 'Личная заметка (макс. 100 симв.)',
    forceReset: 'Принуд. сброс', gamesApps: 'Игры и приложения',
    selectedUser: 'Выбран пользователь: {n}', profileReset: 'Профиль сброшен.', resetFailed: 'Ошибка сброса.',
    forceResetConfirm: 'Сбросить профиль {n}?',
    vip: 'VIP', vipUnlimited: 'VIP · ∞', adminMenu: 'Меню админа', adminVipList: 'Список админ / VIP', profileSetupPreview: 'Предпросмотр настройки профиля', owner: 'Владелец', addRole: 'Добавить', removeRole: 'Удалить', roleUsernamePlaceholder: 'имя пользователя (без @)', roleUpdateFailed: 'Ошибка обновления.', ownerImmutable: 'Роль владельца изменить нельзя.', noRolesYet: 'Пока нет админов или VIP.', close: 'Закрыть', grantVipAll: 'Выдать VIP всем', revokeVipAll: 'Отозвать VIP у всех', forceResetAll: 'Сбросить всех пользователей', forceResetAllConfirm: 'Сбросить ВСЕХ пользователей? При следующем входе все увидят экран «заполните профиль».', resetAllDone: 'Все пользователи сброшены.', period_1w: '1 неделя', period_1mo: '1 месяц', period_3mo: '3 месяца', period_6mo: '6 месяцев', period_1y: '1 год'
  }
};

type VipGrantWindow = 'today' | 'week' | 'month' | '1_day' | '3_days';
type VipGrantNotice = { claimIds: string[]; days: number; vipUntil: string | null };

const vipGrantCopy: Record<LangKey, {
  trigger: string;
  today: string;
  week: string;
  month: string;
  hongKongTime: string;
  random: string;
  randomHint: string;
  allowNewUsers: string;
  campaignCreated: string;
  popupTitle: string;
  popupBody: string;
  popupConfirm: string;
  popupAckFailed: string;
  popupRetry: string;
  popupSaving: string;
  campaignsTitle: string;
  campaign: string;
  sourceApp: string;
  legacySourceApp: string;
  campaignsEmpty: string;
  campaignsLoading: string;
  campaignsLoadMore: string;
  campaignsRefresh: string;
  campaignsLoadFailed: string;
  campaignActive: string;
  campaignEnded: string;
  campaignInactive: string;
  campaignDuration: string;
  campaignRandomDuration: string;
  campaignWindow: string;
  campaignNoCutoff: string;
  campaignCutoff: string;
  campaignClaims: string;
  campaignFailedRewardNotifications: string;
  campaignFailedRewardNotificationsUnavailable: string;
  campaignFailedRewardsReview: string;
  campaignCrossFailedRewardsTitle: string;
  campaignCrossFailedRewardsPlaceholder: string;
  campaignCrossFailedRewardsSearch: string;
  campaignCrossFailedRewardsSourceBot: string;
  campaignCrossFailedRewardsAllSources: string;
  campaignCrossFailedRewardsInitialHint: string;
  campaignCrossFailedRewardsDetails: string;
  campaignFailedRewardsEmpty: string;
  campaignFailedRewardDeliveryUncertain: string;
  campaignFailedRewardDeliveryUncertainConfirm: string;
  campaignFailedRewardsLoading: string;
  campaignFailedRewardsLoadFailed: string;
  campaignFailedRewardClaim: string;
  campaignFailedRewardRecipient: string;
  campaignFailedRewardDetails: string;
  campaignFailedRewardLastAttempt: string;
  campaignFailedRewardRetry: string;
  campaignFailedRewardRetrying: string;
  campaignFailedRewardRetryLimit: string;
  campaignFailedRewardRetrySent: string;
  campaignFailedRewardRetryFailed: string;
  campaignFailedRewardLoadMore: string;
  campaignRetryAuditToggle: string;
  campaignRetryAuditTitle: string;
  campaignRetryAuditEmpty: string;
  campaignRetryAuditLoading: string;
  campaignRetryAuditLoadFailed: string;
  campaignRetryAuditEntry: string;
  campaignRetryAuditPending: string;
  campaignRetryAuditDelivered: string;
  campaignRetryAuditFailed: string;
  campaignRetryAuditUncertain: string;
  campaignRetryAuditLoadMore: string;
  campaignNewFailureAlertTitle: string;
  campaignNewFailureAlertSeparate: string;
  campaignNewFailureAlertLatest: string;
  campaignNewFailureAlertChecking: string;
  campaignNewFailureAlertLoadFailed: string;
  campaignQueueHealthTitle: string;
  campaignQueueHealthSeparate: string;
  campaignQueueHealthPending: string;
  campaignQueueHealthExpiredSending: string;
  campaignQueueHealthOldest: string;
  campaignQueueHealthEmpty: string;
  campaignQueueHealthChecking: string;
  campaignQueueHealthLoadFailed: string;
  campaignNewUsers: string;
  announcementStatus: string;
  announcementPending: string;
  announcementDelivered: string;
  announcementFailed: string;
  announcementCancelled: string;
  announcementLegacy: string;
  campaignStop: string;
  campaignStopping: string;
  campaignStopConfirm: string;
  campaignStoppedNotice: string;
  campaignStopFailed: string;
}> = {
  en: {
    trigger: 'Triggered when a user logs in within',
    today: 'Today',
    week: 'This week',
    month: 'This month',
    hongKongTime: 'Calendar choices use Hong Kong time; 1- and 3-day choices start when the campaign is created.',
    random: 'Random VIP days per user',
    randomHint: '1 day up to the selected duration',
    allowNewUsers: 'Allow new users created before the cutoff',
    campaignCreated: 'VIP campaign created. Its announcement is queued. Eligible users receive VIP days when they log in.',
    popupTitle: 'VIP reward received',
    popupBody: 'Your account received {days} VIP days.',
    popupConfirm: 'Confirm',
    popupAckFailed: 'Could not save your confirmation. Please try again.',
    popupRetry: 'Retry',
    popupSaving: 'Saving…',
    campaignsTitle: 'VIP campaigns',
    campaign: 'Campaign',
    sourceApp: 'Campaign app: {app}',
    legacySourceApp: 'Legacy campaign · both apps',
    campaignsEmpty: 'No VIP campaigns have been created.',
    campaignsLoading: 'Loading VIP campaigns…',
    campaignsLoadMore: 'Load more',
    campaignsRefresh: 'Refresh',
    campaignsLoadFailed: 'Could not load VIP campaigns. Refresh to retry.',
    campaignActive: 'Active',
    campaignEnded: 'Eligibility ended',
    campaignInactive: 'Inactive',
    campaignDuration: '{days} days',
    campaignRandomDuration: 'Random: 1–{days} days',
    campaignWindow: 'Login window: {window}',
    campaignNoCutoff: 'No login cutoff',
    campaignCutoff: 'Eligibility cutoff: {time} (Hong Kong time)',
    campaignClaims: 'Issued claims: {count}',
    campaignFailedRewardNotifications: 'Reward messages needing review: {count}',
    campaignFailedRewardNotificationsUnavailable: 'Reward message count unavailable on the current backend.',
    campaignFailedRewardsReview: 'Review messages ({count})',
    campaignCrossFailedRewardsTitle: 'Failed reward messages across campaigns',
    campaignCrossFailedRewardsPlaceholder: 'Search username or Telegram account ID',
    campaignCrossFailedRewardsSearch: 'Search all campaigns',
    campaignCrossFailedRewardsSourceBot: 'Source app',
    campaignCrossFailedRewardsAllSources: 'All apps',
    campaignCrossFailedRewardsInitialHint: 'Search by username or account ID, or choose a source app.',
    campaignCrossFailedRewardsDetails: 'Campaign {campaign} · source {source} · notification bot {bot}',
    campaignFailedRewardsEmpty: 'No reward messages need review.',
    campaignFailedRewardDeliveryUncertain: 'Delivery is uncertain: Telegram may already have sent this message. A manual retry could send a duplicate.',
    campaignFailedRewardDeliveryUncertainConfirm: 'Telegram may already have delivered this message. Retry anyway? The user could receive a duplicate.',
    campaignFailedRewardsLoading: 'Loading failed messages…',
    campaignFailedRewardsLoadFailed: 'Could not load failed messages. Refresh to retry.',
    campaignFailedRewardClaim: 'Claim {id}',
    campaignFailedRewardRecipient: 'Recipient: {recipient}',
    campaignFailedRewardDetails: '{days} VIP days · {attempts} attempts · {retries}/3 manual retries',
    campaignFailedRewardLastAttempt: 'Last attempt: {time}',
    campaignFailedRewardRetry: 'Retry notification',
    campaignFailedRewardRetrying: 'Sending…',
    campaignFailedRewardRetryLimit: 'Retry limit reached',
    campaignFailedRewardRetrySent: 'Reward message sent.',
    campaignFailedRewardRetryFailed: 'The message still failed. You may retry if attempts remain.',
    campaignFailedRewardLoadMore: 'Load more failed messages',
    campaignRetryAuditToggle: 'View retry audit',
    campaignRetryAuditTitle: 'Manual retry audit',
    campaignRetryAuditEmpty: 'No manual retries are recorded for this campaign.',
    campaignRetryAuditLoading: 'Loading retry audit…',
    campaignRetryAuditLoadFailed: 'Could not load retry audit. Refresh to retry.',
    campaignRetryAuditEntry: 'Admin {admin} · {time} · claim {claim} · campaign {source} · notification bot {bot} · result {outcome}',
    campaignRetryAuditPending: 'Pending',
    campaignRetryAuditDelivered: 'Delivered',
    campaignRetryAuditFailed: 'Failed',
    campaignRetryAuditUncertain: 'Delivery uncertain',
    campaignRetryAuditLoadMore: 'Load more retry records',
    campaignNewUsers: 'Includes new accounts created before the cutoff',
    campaignNewFailureAlertTitle: 'New failed VIP reward messages: {count}',
    campaignNewFailureAlertSeparate: 'These reward DMs are separate from public campaign announcements.',
    campaignNewFailureAlertLatest: 'Latest reward failure: {time}',
    campaignNewFailureAlertChecking: 'Checking for new failed reward messages…',
    campaignNewFailureAlertLoadFailed: 'Could not check for new reward messages. Refresh to try again.',
    campaignQueueHealthTitle: 'VIP reward delivery queue health',
    campaignQueueHealthSeparate: 'Pending notices are overdue after 10 minutes; sending notices are counted when their lease expires. Excludes terminally failed reward DMs and public announcements.',
    campaignQueueHealthPending: 'Overdue pending: {count}',
    campaignQueueHealthExpiredSending: 'Expired sending leases: {count}',
    campaignQueueHealthOldest: 'Oldest wait: {time} · {minutes} min',
    campaignQueueHealthEmpty: 'No overdue pending or expired sending notices.',
    campaignQueueHealthChecking: 'Checking scheduled reward queue…',
    campaignQueueHealthLoadFailed: 'Could not load scheduled reward queue health. Refresh to retry.',
    announcementStatus: 'Announcement',
    announcementPending: 'Queued',
    announcementDelivered: 'Posted',
    announcementFailed: 'Delivery failed',
    announcementCancelled: 'Not sent; campaign ended',
    announcementLegacy: 'Legacy campaign; no announcement',
    campaignStop: 'Stop campaign',
    campaignStopping: 'Stopping…',
    campaignStopConfirm: 'Stop this campaign? Existing VIP days remain; no new users will receive this campaign.',
    campaignStoppedNotice: 'Campaign stopped. VIP days already awarded were not removed.',
    campaignStopFailed: 'Campaign could not be stopped. Refresh and try again.',
  },
  'zh-CN': {
    trigger: '用户在以下期限内登录时触发',
    today: '今天',
    week: '本周',
    month: '本月',
    hongKongTime: '日历选项按香港时间计算；1 天和 3 天选项从创建活动时开始。',
    random: '为每位用户随机分配 VIP 天数',
    randomHint: '1 天至所选时长',
    allowNewUsers: '允许截止时间前注册的新用户参加',
    campaignCreated: 'VIP 活动已创建，公告已加入发送队列。符合条件的用户登录后会收到 VIP 天数。',
    popupTitle: '已收到 VIP 奖励',
    popupBody: '你的账户已获得 {days} 天 VIP。',
    popupConfirm: '确认',
    popupAckFailed: '确认未能保存，请重试。',
    popupRetry: '重试',
    popupSaving: '保存中…',
    campaignsTitle: 'VIP 活动',
    campaign: '活动',
    sourceApp: '活动所属应用：{app}',
    legacySourceApp: '旧活动 · 两个应用均可领取',
    campaignsEmpty: '尚未创建 VIP 活动。',
    campaignsLoading: '正在加载 VIP 活动…',
    campaignsLoadMore: '加载更多',
    campaignsRefresh: '刷新',
    campaignsLoadFailed: '无法加载 VIP 活动。请刷新重试。',
    campaignActive: '进行中',
    campaignEnded: '领取期限已结束',
    campaignInactive: '未启用',
    campaignDuration: '{days} 天',
    campaignRandomDuration: '随机：1–{days} 天',
    campaignWindow: '登录期限：{window}',
    campaignNoCutoff: '没有登录截止时间',
    campaignCutoff: '领取截止时间：{time}（香港时间）',
    campaignClaims: '已发放：{count} 份',
    campaignFailedRewardNotifications: '需要检查的奖励通知：{count} 条',
    campaignFailedRewardNotificationsUnavailable: '目前的后端版本未提供奖励通知数量。',
    campaignFailedRewardsReview: '查看通知（{count}）',
    campaignCrossFailedRewardsTitle: '跨活动失败的奖励通知',
    campaignCrossFailedRewardsPlaceholder: '搜索用户名或 Telegram 账号 ID',
    campaignCrossFailedRewardsSearch: '搜索所有活动',
    campaignCrossFailedRewardsSourceBot: '来源应用',
    campaignCrossFailedRewardsAllSources: '所有应用',
    campaignCrossFailedRewardsInitialHint: '按用户名或账号 ID 搜索，或选择来源应用。',
    campaignCrossFailedRewardsDetails: '活动 {campaign} · 来源 {source} · 通知机器人 {bot}',
    campaignFailedRewardsEmpty: '没有需要检查的奖励通知。',
    campaignFailedRewardDeliveryUncertain: '发送状态不确定：Telegram 可能已发送该消息。手动重试可能造成重复通知。',
    campaignFailedRewardDeliveryUncertainConfirm: 'Telegram 可能已发送该消息。仍要重试吗？用户可能会收到重复消息。',
    campaignFailedRewardsLoading: '正在加载失败通知…',
    campaignFailedRewardsLoadFailed: '无法加载失败通知，请刷新后重试。',
    campaignFailedRewardClaim: '领取记录 {id}',
    campaignFailedRewardRecipient: '收件人：{recipient}',
    campaignFailedRewardDetails: '{days} 天 VIP · {attempts} 次尝试 · 手动重试 {retries}/3 次',
    campaignFailedRewardLastAttempt: '最近尝试：{time}',
    campaignFailedRewardRetry: '重试通知',
    campaignFailedRewardRetrying: '正在发送…',
    campaignFailedRewardRetryLimit: '已达到重试上限',
    campaignFailedRewardRetrySent: '奖励通知已发送。',
    campaignFailedRewardRetryFailed: '通知仍发送失败；如有剩余次数，可再次重试。',
    campaignFailedRewardLoadMore: '加载更多失败通知',
    campaignRetryAuditToggle: '查看重试审计',
    campaignRetryAuditTitle: '手动重试审计',
    campaignRetryAuditEmpty: '此活动没有手动重试记录。',
    campaignRetryAuditLoading: '正在加载重试审计…',
    campaignRetryAuditLoadFailed: '无法加载重试审计，请刷新后重试。',
    campaignRetryAuditEntry: '管理员 {admin} · {time} · 领取记录 {claim} · 活动来源 {source} · 通知机器人 {bot} · 结果 {outcome}',
    campaignRetryAuditPending: '待处理',
    campaignRetryAuditDelivered: '已送达',
    campaignRetryAuditFailed: '失败',
    campaignRetryAuditUncertain: '发送状态不明',
    campaignRetryAuditLoadMore: '加载更多重试记录',
    campaignNewUsers: '包含截止时间前创建的新账号',
    campaignNewFailureAlertTitle: '新失败的 VIP 奖励通知：{count} 条',
    campaignNewFailureAlertSeparate: '这些奖励私信与公开活动公告的发送状态分开显示。',
    campaignNewFailureAlertLatest: '最近一次奖励通知失败：{time}',
    campaignNewFailureAlertChecking: '正在检查新的奖励通知失败…',
    campaignNewFailureAlertLoadFailed: '无法检查新的奖励通知失败，请刷新重试。',
    campaignQueueHealthTitle: 'VIP奖励通知队列状态',
    campaignQueueHealthSeparate: '待处理超过10分钟后计为超时；发送中的通知在租约过期后计入。此处不包括最终失败的奖励私信或公开公告。',
    campaignQueueHealthPending: '超时待处理：{count}',
    campaignQueueHealthExpiredSending: '发送租约已过期：{count}',
    campaignQueueHealthOldest: '最早等待：{time} · {minutes} 分钟',
    campaignQueueHealthEmpty: '没有超时待处理或发送租约过期的通知。',
    campaignQueueHealthChecking: '正在检查定时奖励通知队列…',
    campaignQueueHealthLoadFailed: '无法加载奖励通知队列状态，请刷新重试。',
    announcementStatus: '公告状态',
    announcementPending: '排队中',
    announcementDelivered: '已发布',
    announcementFailed: '发送失败',
    announcementCancelled: '活动结束，未发送',
    announcementLegacy: '旧活动，未发布公告',
    campaignStop: '停止活动',
    campaignStopping: '正在停止…',
    campaignStopConfirm: '停止此活动？已发放的 VIP 天数会保留，不再向新用户发放。',
    campaignStoppedNotice: '活动已停止。已发放的 VIP 天数没有被移除。',
    campaignStopFailed: '无法停止活动。请刷新后重试。',
  },
  'zh-TW': {
    trigger: '使用者在以下期限內登入時觸發',
    today: '今天',
    week: '本週',
    month: '本月',
    hongKongTime: '日曆選項依香港時間計算；1 天和 3 天選項從建立活動時開始。',
    random: '為每位使用者隨機分配 VIP 天數',
    randomHint: '1 天至所選時長',
    allowNewUsers: '允許截止時間前建立的新使用者參加',
    campaignCreated: 'VIP 活動已建立，公告已加入傳送佇列。符合資格的使用者登入後會收到 VIP 天數。',
    popupTitle: '已收到 VIP 獎勵',
    popupBody: '你的帳戶已獲得 {days} 天 VIP。',
    popupConfirm: '確認',
    popupAckFailed: '確認未能儲存，請重試。',
    popupRetry: '重試',
    popupSaving: '儲存中…',
    campaignsTitle: 'VIP 活動',
    campaign: '活動',
    sourceApp: '活動所屬應用程式：{app}',
    legacySourceApp: '舊活動 · 兩個應用程式均可領取',
    campaignsEmpty: '尚未建立 VIP 活動。',
    campaignsLoading: '正在載入 VIP 活動…',
    campaignsLoadMore: '載入更多',
    campaignsRefresh: '重新整理',
    campaignsLoadFailed: '無法載入 VIP 活動。請重新整理後重試。',
    campaignActive: '進行中',
    campaignEnded: '領取期限已結束',
    campaignInactive: '未啟用',
    campaignDuration: '{days} 天',
    campaignRandomDuration: '隨機：1–{days} 天',
    campaignWindow: '登入期限：{window}',
    campaignNoCutoff: '沒有登入截止時間',
    campaignCutoff: '領取截止時間：{time}（香港時間）',
    campaignClaims: '已發放：{count} 份',
    campaignFailedRewardNotifications: '需要檢查的獎勵通知：{count} 則',
    campaignFailedRewardNotificationsUnavailable: '目前的後端版本未提供獎勵通知數量。',
    campaignFailedRewardsReview: '查看通知（{count}）',
    campaignCrossFailedRewardsTitle: '跨活動失敗的獎勵通知',
    campaignCrossFailedRewardsPlaceholder: '搜尋使用者名稱或 Telegram 帳號 ID',
    campaignCrossFailedRewardsSearch: '搜尋所有活動',
    campaignCrossFailedRewardsSourceBot: '來源應用程式',
    campaignCrossFailedRewardsAllSources: '所有應用程式',
    campaignCrossFailedRewardsInitialHint: '按使用者名稱或帳號 ID 搜尋，或選擇來源應用程式。',
    campaignCrossFailedRewardsDetails: '活動 {campaign} · 來源 {source} · 通知機器人 {bot}',
    campaignFailedRewardsEmpty: '沒有需要檢查的獎勵通知。',
    campaignFailedRewardDeliveryUncertain: '傳送狀態不確定：Telegram 可能已傳送此訊息。手動重試可能造成重複通知。',
    campaignFailedRewardDeliveryUncertainConfirm: 'Telegram 可能已傳送此訊息。仍要重試嗎？使用者可能會收到重複訊息。',
    campaignFailedRewardsLoading: '正在載入失敗通知…',
    campaignFailedRewardsLoadFailed: '無法載入失敗通知，請重新整理後重試。',
    campaignFailedRewardClaim: '領取記錄 {id}',
    campaignFailedRewardRecipient: '收件人：{recipient}',
    campaignFailedRewardDetails: '{days} 天 VIP · {attempts} 次嘗試 · 手動重試 {retries}/3 次',
    campaignFailedRewardLastAttempt: '最近嘗試：{time}',
    campaignFailedRewardRetry: '重試通知',
    campaignFailedRewardRetrying: '正在傳送…',
    campaignFailedRewardRetryLimit: '已達重試上限',
    campaignFailedRewardRetrySent: '獎勵通知已傳送。',
    campaignFailedRewardRetryFailed: '通知仍傳送失敗；如有剩餘次數，可再次重試。',
    campaignFailedRewardLoadMore: '載入更多失敗通知',
    campaignRetryAuditToggle: '查看重試審計',
    campaignRetryAuditTitle: '手動重試審計',
    campaignRetryAuditEmpty: '此活動沒有手動重試記錄。',
    campaignRetryAuditLoading: '正在載入重試審計…',
    campaignRetryAuditLoadFailed: '無法載入重試審計，請重新整理後再試。',
    campaignRetryAuditEntry: '管理員 {admin} · {time} · 領取記錄 {claim} · 活動來源 {source} · 通知機器人 {bot} · 結果 {outcome}',
    campaignRetryAuditPending: '待處理',
    campaignRetryAuditDelivered: '已送達',
    campaignRetryAuditFailed: '失敗',
    campaignRetryAuditUncertain: '傳送狀態不明',
    campaignRetryAuditLoadMore: '載入更多重試記錄',
    campaignNewUsers: '包含截止時間前建立的新帳戶',
    campaignNewFailureAlertTitle: '新失敗的 VIP 獎勵通知：{count} 則',
    campaignNewFailureAlertSeparate: '這些獎勵私訊與公開活動公告的傳送狀態分開顯示。',
    campaignNewFailureAlertLatest: '最近一次獎勵通知失敗：{time}',
    campaignNewFailureAlertChecking: '正在檢查新的獎勵通知失敗…',
    campaignNewFailureAlertLoadFailed: '無法檢查新的獎勵通知失敗，請重新整理再試。',
    campaignQueueHealthTitle: 'VIP獎勵通知佇列狀態',
    campaignQueueHealthSeparate: '待處理超過10分鐘後列為逾期；傳送中的通知會在租約到期後列入。這不包括最終失敗的獎勵私訊或公開公告。',
    campaignQueueHealthPending: '逾期待處理：{count}',
    campaignQueueHealthExpiredSending: '傳送租約已過期：{count}',
    campaignQueueHealthOldest: '最早等待：{time} · {minutes} 分鐘',
    campaignQueueHealthEmpty: '沒有逾期待處理或傳送租約過期的通知。',
    campaignQueueHealthChecking: '正在檢查定時獎勵通知佇列…',
    campaignQueueHealthLoadFailed: '無法載入獎勵通知佇列狀態，請重新整理再試。',
    announcementStatus: '公告狀態',
    announcementPending: '排隊中',
    announcementDelivered: '已發布',
    announcementFailed: '傳送失敗',
    announcementCancelled: '活動已結束，未發送',
    announcementLegacy: '舊活動，沒有公告',
    campaignStop: '停止活動',
    campaignStopping: '正在停止…',
    campaignStopConfirm: '停止此活動？已發放的 VIP 天數會保留，不再向新使用者發放。',
    campaignStoppedNotice: '活動已停止。已發放的 VIP 天數沒有被移除。',
    campaignStopFailed: '無法停止活動。請重新整理後重試。',
  },
  ja: {
    trigger: '次の期間内にログインしたユーザーに付与',
    today: '今日',
    week: '今週',
    month: '今月',
    hongKongTime: '暦の選択肢は香港時間、1日・3日の選択肢はキャンペーン作成時から計算します。',
    random: 'ユーザーごとにVIP日数をランダムにする',
    randomHint: '1日から選択した期間まで',
    allowNewUsers: '締切前に登録した新規ユーザーも対象にする',
    campaignCreated: 'VIPキャンペーンを作成し、告知を送信キューに追加しました。対象ユーザーはログイン時にVIP日数を受け取ります。',
    popupTitle: 'VIP特典を受け取りました',
    popupBody: 'アカウントにVIPが{days}日分追加されました。',
    popupConfirm: '確認',
    popupAckFailed: '確認を保存できませんでした。もう一度お試しください。',
    popupRetry: '再試行',
    popupSaving: '保存中…',
    campaignsTitle: 'VIPキャンペーン',
    campaign: 'キャンペーン',
    sourceApp: '対象アプリ：{app}',
    legacySourceApp: '旧キャンペーン・両方のアプリが対象',
    campaignsEmpty: 'VIPキャンペーンはまだありません。',
    campaignsLoading: 'VIPキャンペーンを読み込み中…',
    campaignsLoadMore: 'もっと読み込む',
    campaignsRefresh: '更新',
    campaignsLoadFailed: 'VIPキャンペーンを読み込めません。更新して再試行してください。',
    campaignActive: '実施中',
    campaignEnded: '対象期間終了',
    campaignInactive: '無効',
    campaignDuration: '{days}日',
    campaignRandomDuration: 'ランダム：1～{days}日',
    campaignWindow: 'ログイン期間：{window}',
    campaignNoCutoff: 'ログイン締切なし',
    campaignCutoff: '対象締切：{time}（香港時間）',
    campaignClaims: '付与済み：{count}件',
    campaignFailedRewardNotifications: '確認が必要な報酬通知：{count}件',
    campaignFailedRewardNotificationsUnavailable: '現在のバックエンド版では報酬通知数を取得できません。',
    campaignFailedRewardsReview: '通知を確認（{count}）',
    campaignCrossFailedRewardsTitle: '全キャンペーンの未配信報酬通知',
    campaignCrossFailedRewardsPlaceholder: 'ユーザー名またはTelegramアカウントIDを検索',
    campaignCrossFailedRewardsSearch: '全キャンペーンを検索',
    campaignCrossFailedRewardsSourceBot: '元のアプリ',
    campaignCrossFailedRewardsAllSources: 'すべてのアプリ',
    campaignCrossFailedRewardsInitialHint: 'ユーザー名またはアカウントIDで検索するか、元のアプリを選択してください。',
    campaignCrossFailedRewardsDetails: 'キャンペーン {campaign} · 元のアプリ {source} · 通知ボット {bot}',
    campaignFailedRewardsEmpty: '確認が必要な報酬通知はありません。',
    campaignFailedRewardDeliveryUncertain: '配信状況が不明です。Telegramがすでに送信した可能性があり、手動で再試行すると重複することがあります。',
    campaignFailedRewardDeliveryUncertainConfirm: 'Telegramがすでに送信した可能性があります。それでも再試行しますか？重複して届くことがあります。',
    campaignFailedRewardsLoading: '失敗した通知を読み込み中…',
    campaignFailedRewardsLoadFailed: '失敗した通知を読み込めません。更新して再試行してください。',
    campaignFailedRewardClaim: '申請 {id}',
    campaignFailedRewardRecipient: '受信者：{recipient}',
    campaignFailedRewardDetails: 'VIP {days}日 · 送信試行 {attempts}回 · 手動再試行 {retries}/3回',
    campaignFailedRewardLastAttempt: '最終試行：{time}',
    campaignFailedRewardRetry: '通知を再試行',
    campaignFailedRewardRetrying: '送信中…',
    campaignFailedRewardRetryLimit: '再試行上限に達しました',
    campaignFailedRewardRetrySent: '報酬通知を送信しました。',
    campaignFailedRewardRetryFailed: '通知を送信できませんでした。残り回数があれば再試行できます。',
    campaignFailedRewardLoadMore: '失敗した通知をさらに読み込む',
    campaignRetryAuditToggle: '再試行履歴を表示',
    campaignRetryAuditTitle: '手動再試行履歴',
    campaignRetryAuditEmpty: 'このキャンペーンに手動再試行の記録はありません。',
    campaignRetryAuditLoading: '再試行履歴を読み込み中…',
    campaignRetryAuditLoadFailed: '再試行履歴を読み込めません。更新して再試行してください。',
    campaignRetryAuditEntry: '管理者 {admin} · {time} · 申請 {claim} · キャンペーン元 {source} · 通知Bot {bot} · 結果 {outcome}',
    campaignRetryAuditPending: '保留中',
    campaignRetryAuditDelivered: '配信済み',
    campaignRetryAuditFailed: '失敗',
    campaignRetryAuditUncertain: '配信状況不明',
    campaignRetryAuditLoadMore: '再試行履歴をさらに読み込む',
    campaignNewUsers: '締切前に作成された新規アカウントを含む',
    campaignNewFailureAlertTitle: '新たに失敗したVIP報酬通知：{count}件',
    campaignNewFailureAlertSeparate: '報酬のDMは公開キャンペーン告知とは別に表示されます。',
    campaignNewFailureAlertLatest: '最新の報酬通知失敗：{time}',
    campaignNewFailureAlertChecking: '新しい報酬通知の失敗を確認中…',
    campaignNewFailureAlertLoadFailed: '新しい報酬通知の失敗を確認できません。更新して再試行してください。',
    campaignQueueHealthTitle: 'VIP報酬通知キューの状態',
    campaignQueueHealthSeparate: '保留中の通知は10分後に遅延扱いとなり、送信中の通知はリース期限切れ後に表示されます。最終失敗した報酬DMや公開告知は含みません。',
    campaignQueueHealthPending: '遅延中の保留：{count}',
    campaignQueueHealthExpiredSending: '期限切れの送信リース：{count}',
    campaignQueueHealthOldest: '最も長い待機：{time} · {minutes}分',
    campaignQueueHealthEmpty: '遅延中またはリース期限切れの通知はありません。',
    campaignQueueHealthChecking: '予約済み報酬通知キューを確認中…',
    campaignQueueHealthLoadFailed: '報酬通知キューを読み込めません。更新して再試行してください。',
    announcementStatus: '告知状況',
    announcementPending: '送信待ち',
    announcementDelivered: '投稿済み',
    announcementFailed: '送信失敗',
    announcementCancelled: 'キャンペーン終了・未送信',
    announcementLegacy: '旧キャンペーン・告知なし',
    campaignStop: 'キャンペーンを停止',
    campaignStopping: '停止中…',
    campaignStopConfirm: 'このキャンペーンを停止しますか？付与済みのVIP日数は維持され、今後の付与は停止します。',
    campaignStoppedNotice: 'キャンペーンを停止しました。付与済みのVIP日数は取り消されていません。',
    campaignStopFailed: 'キャンペーンを停止できませんでした。更新して再試行してください。',
  },
  ko: {
    trigger: '다음 기간 내 로그인한 사용자에게 지급',
    today: '오늘',
    week: '이번 주',
    month: '이번 달',
    hongKongTime: '달력 옵션은 홍콩 시간 기준이며, 1일·3일 옵션은 캠페인 생성 시부터 계산됩니다.',
    random: '사용자별 VIP 일수를 무작위로 지급',
    randomHint: '1일부터 선택한 기간까지',
    allowNewUsers: '마감 전 가입한 신규 사용자도 포함',
    campaignCreated: 'VIP 캠페인이 생성되었고 공지가 전송 대기열에 추가되었습니다. 대상 사용자는 로그인할 때 VIP 일수를 받습니다.',
    popupTitle: 'VIP 보상을 받았습니다',
    popupBody: '계정에 VIP {days}일이 추가되었습니다.',
    popupConfirm: '확인',
    popupAckFailed: '확인을 저장하지 못했습니다. 다시 시도해 주세요.',
    popupRetry: '다시 시도',
    popupSaving: '저장 중…',
    campaignsTitle: 'VIP 캠페인',
    campaign: '캠페인',
    sourceApp: '캠페인 앱: {app}',
    legacySourceApp: '이전 캠페인 · 두 앱 모두 적용',
    campaignsEmpty: '생성된 VIP 캠페인이 없습니다.',
    campaignsLoading: 'VIP 캠페인 불러오는 중…',
    campaignsLoadMore: '더 불러오기',
    campaignsRefresh: '새로고침',
    campaignsLoadFailed: 'VIP 캠페인을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.',
    campaignActive: '진행 중',
    campaignEnded: '대상 기간 종료',
    campaignInactive: '비활성',
    campaignDuration: '{days}일',
    campaignRandomDuration: '무작위: 1–{days}일',
    campaignWindow: '로그인 기간: {window}',
    campaignNoCutoff: '로그인 마감 없음',
    campaignCutoff: '대상 마감: {time} (홍콩 시간)',
    campaignClaims: '지급 완료: {count}건',
    campaignFailedRewardNotifications: '확인이 필요한 보상 알림: {count}건',
    campaignFailedRewardNotificationsUnavailable: '현재 백엔드 버전에서는 보상 알림 수를 제공하지 않습니다.',
    campaignFailedRewardsReview: '알림 확인 ({count})',
    campaignCrossFailedRewardsTitle: '전체 캠페인의 실패한 보상 알림',
    campaignCrossFailedRewardsPlaceholder: '사용자 이름 또는 Telegram 계정 ID 검색',
    campaignCrossFailedRewardsSearch: '전체 캠페인 검색',
    campaignCrossFailedRewardsSourceBot: '원본 앱',
    campaignCrossFailedRewardsAllSources: '모든 앱',
    campaignCrossFailedRewardsInitialHint: '사용자 이름이나 계정 ID로 검색하거나 원본 앱을 선택하세요.',
    campaignCrossFailedRewardsDetails: '캠페인 {campaign} · 원본 앱 {source} · 알림 봇 {bot}',
    campaignFailedRewardsEmpty: '확인이 필요한 보상 알림이 없습니다.',
    campaignFailedRewardDeliveryUncertain: '전송 상태를 확인할 수 없습니다. Telegram이 이미 보냈을 수 있으며, 수동 재시도 시 중복 전송될 수 있습니다.',
    campaignFailedRewardDeliveryUncertainConfirm: 'Telegram이 이미 보냈을 수 있습니다. 그래도 다시 보낼까요? 중복 메시지가 전송될 수 있습니다.',
    campaignFailedRewardsLoading: '실패한 알림을 불러오는 중…',
    campaignFailedRewardsLoadFailed: '실패한 알림을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.',
    campaignFailedRewardClaim: '청구 {id}',
    campaignFailedRewardRecipient: '수신자: {recipient}',
    campaignFailedRewardDetails: 'VIP {days}일 · 전송 시도 {attempts}회 · 수동 재시도 {retries}/3회',
    campaignFailedRewardLastAttempt: '마지막 시도: {time}',
    campaignFailedRewardRetry: '알림 재시도',
    campaignFailedRewardRetrying: '전송 중…',
    campaignFailedRewardRetryLimit: '재시도 한도에 도달했습니다',
    campaignFailedRewardRetrySent: '보상 알림을 전송했습니다.',
    campaignFailedRewardRetryFailed: '알림 전송에 실패했습니다. 남은 횟수가 있으면 다시 시도할 수 있습니다.',
    campaignFailedRewardLoadMore: '실패한 알림 더 보기',
    campaignRetryAuditToggle: '재시도 기록 보기',
    campaignRetryAuditTitle: '수동 재시도 기록',
    campaignRetryAuditEmpty: '이 캠페인에는 수동 재시도 기록이 없습니다.',
    campaignRetryAuditLoading: '재시도 기록 불러오는 중…',
    campaignRetryAuditLoadFailed: '재시도 기록을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.',
    campaignRetryAuditEntry: '관리자 {admin} · {time} · 청구 {claim} · 캠페인 출처 {source} · 알림 봇 {bot} · 결과 {outcome}',
    campaignRetryAuditPending: '대기 중',
    campaignRetryAuditDelivered: '전송 완료',
    campaignRetryAuditFailed: '실패',
    campaignRetryAuditUncertain: '전송 상태 불확실',
    campaignRetryAuditLoadMore: '재시도 기록 더 보기',
    campaignNewUsers: '마감 전에 생성된 신규 계정 포함',
    campaignNewFailureAlertTitle: '새 VIP 보상 알림 전송 실패: {count}건',
    campaignNewFailureAlertSeparate: '보상 DM 상태는 공개 캠페인 공지 전송 상태와 별도로 표시됩니다.',
    campaignNewFailureAlertLatest: '최근 보상 알림 실패: {time}',
    campaignNewFailureAlertChecking: '새 보상 알림 실패를 확인하는 중…',
    campaignNewFailureAlertLoadFailed: '새 보상 알림 실패를 확인할 수 없습니다. 새로고침 후 다시 시도하세요.',
    campaignQueueHealthTitle: 'VIP 보상 알림 대기열 상태',
    campaignQueueHealthSeparate: '대기 알림은 10분 후 지연으로 표시되고, 전송 중인 알림은 임대 시간이 만료되면 표시됩니다. 최종 실패한 보상 DM과 공개 공지는 포함하지 않습니다.',
    campaignQueueHealthPending: '지연 대기: {count}',
    campaignQueueHealthExpiredSending: '전송 임대 만료: {count}',
    campaignQueueHealthOldest: '가장 오래 기다린 항목: {time} · {minutes}분',
    campaignQueueHealthEmpty: '지연 대기 또는 임대 만료 알림이 없습니다.',
    campaignQueueHealthChecking: '예약된 보상 알림 대기열 확인 중…',
    campaignQueueHealthLoadFailed: '보상 알림 대기열을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.',
    announcementStatus: '공지 상태',
    announcementPending: '전송 대기 중',
    announcementDelivered: '게시됨',
    announcementFailed: '전송 실패',
    announcementCancelled: '캠페인 종료로 미전송',
    announcementLegacy: '이전 캠페인 · 공지 없음',
    campaignStop: '캠페인 중지',
    campaignStopping: '중지 중…',
    campaignStopConfirm: '이 캠페인을 중지할까요? 이미 지급된 VIP 기간은 유지되고 추가 지급만 중단됩니다.',
    campaignStoppedNotice: '캠페인이 중지되었습니다. 이미 지급된 VIP 기간은 취소되지 않았습니다.',
    campaignStopFailed: '캠페인을 중지하지 못했습니다. 새로고침 후 다시 시도하세요.',
  },
  ru: {
    trigger: 'Начислять пользователям, вошедшим в течение',
    today: 'Сегодня',
    week: 'Этой недели',
    month: 'Этого месяца',
    hongKongTime: 'Календарные варианты используют время Гонконга; 1 и 3 дня отсчитываются с момента создания кампании.',
    random: 'Случайное число VIP-дней для каждого пользователя',
    randomHint: 'От 1 дня до выбранного срока',
    allowNewUsers: 'Включить новых пользователей, зарегистрированных до срока',
    campaignCreated: 'VIP-кампания создана, объявление поставлено в очередь. Подходящие пользователи получат VIP-дни при входе.',
    popupTitle: 'VIP-награда получена',
    popupBody: 'Ваш аккаунт получил VIP на {days} дн.',
    popupConfirm: 'Подтвердить',
    popupAckFailed: 'Не удалось сохранить подтверждение. Повторите попытку.',
    popupRetry: 'Повторить',
    popupSaving: 'Сохранение…',
    campaignsTitle: 'VIP-кампании',
    campaign: 'Кампания',
    sourceApp: 'Приложение кампании: {app}',
    legacySourceApp: 'Старая кампания · оба приложения',
    campaignsEmpty: 'VIP-кампании ещё не созданы.',
    campaignsLoading: 'Загрузка VIP-кампаний…',
    campaignsLoadMore: 'Загрузить ещё',
    campaignsRefresh: 'Обновить',
    campaignsLoadFailed: 'Не удалось загрузить VIP-кампании. Обновите страницу и попробуйте снова.',
    campaignActive: 'Активна',
    campaignEnded: 'Срок участия истёк',
    campaignInactive: 'Неактивна',
    campaignDuration: '{days} дн.',
    campaignRandomDuration: 'Случайно: от 1 до {days} дн.',
    campaignWindow: 'Период входа: {window}',
    campaignNoCutoff: 'Без срока входа',
    campaignCutoff: 'Срок участия: {time} (время Гонконга)',
    campaignClaims: 'Выдано: {count}',
    campaignFailedRewardNotifications: 'Уведомлений, требующих проверки: {count}',
    campaignFailedRewardNotificationsUnavailable: 'Текущая версия бэкенда не предоставляет число таких уведомлений.',
    campaignFailedRewardsReview: 'Проверить уведомления ({count})',
    campaignCrossFailedRewardsTitle: 'Неотправленные уведомления по всем VIP-кампаниям',
    campaignCrossFailedRewardsPlaceholder: 'Поиск по имени пользователя или ID Telegram',
    campaignCrossFailedRewardsSearch: 'Искать во всех кампаниях',
    campaignCrossFailedRewardsSourceBot: 'Исходное приложение',
    campaignCrossFailedRewardsAllSources: 'Все приложения',
    campaignCrossFailedRewardsInitialHint: 'Найдите пользователя по имени или ID либо выберите исходное приложение.',
    campaignCrossFailedRewardsDetails: 'Кампания {campaign} · источник {source} · бот уведомления {bot}',
    campaignFailedRewardsEmpty: 'Нет уведомлений, требующих проверки.',
    campaignFailedRewardDeliveryUncertain: 'Статус доставки неизвестен: Telegram мог уже отправить сообщение. Ручной повтор может создать дубликат.',
    campaignFailedRewardDeliveryUncertainConfirm: 'Telegram мог уже доставить сообщение. Повторить отправку? Пользователь может получить дубликат.',
    campaignFailedRewardsLoading: 'Загрузка неудачных уведомлений…',
    campaignFailedRewardsLoadFailed: 'Не удалось загрузить неудачные уведомления. Обновите страницу.',
    campaignFailedRewardClaim: 'Заявка {id}',
    campaignFailedRewardRecipient: 'Получатель: {recipient}',
    campaignFailedRewardDetails: 'VIP-дней: {days} · попыток: {attempts} · ручных повторов: {retries}/3',
    campaignFailedRewardLastAttempt: 'Последняя попытка: {time}',
    campaignFailedRewardRetry: 'Повторить уведомление',
    campaignFailedRewardRetrying: 'Отправка…',
    campaignFailedRewardRetryLimit: 'Лимит повторов исчерпан',
    campaignFailedRewardRetrySent: 'Уведомление о награде отправлено.',
    campaignFailedRewardRetryFailed: 'Не удалось отправить сообщение. Повторите, если попытки остались.',
    campaignFailedRewardLoadMore: 'Загрузить ещё неудачные уведомления',
    campaignRetryAuditToggle: 'История повторных отправок',
    campaignRetryAuditTitle: 'История ручных повторов',
    campaignRetryAuditEmpty: 'Для этой кампании нет ручных повторов.',
    campaignRetryAuditLoading: 'Загружаем историю повторов…',
    campaignRetryAuditLoadFailed: 'Не удалось загрузить историю. Обновите страницу и попробуйте снова.',
    campaignRetryAuditEntry: 'Администратор {admin} · {time} · заявка {claim} · источник кампании {source} · бот уведомления {bot} · результат {outcome}',
    campaignRetryAuditPending: 'Ожидает',
    campaignRetryAuditDelivered: 'Доставлено',
    campaignRetryAuditFailed: 'Не доставлено',
    campaignRetryAuditUncertain: 'Доставка не подтверждена',
    campaignRetryAuditLoadMore: 'Загрузить ещё записи',
    campaignNewUsers: 'Включает новые аккаунты, созданные до срока',
    campaignNewFailureAlertTitle: 'Новые сбои VIP-уведомлений о наградах: {count}',
    campaignNewFailureAlertSeparate: 'Личные сообщения о наградах показаны отдельно от публичных объявлений кампании.',
    campaignNewFailureAlertLatest: 'Последний сбой уведомления о награде: {time}',
    campaignNewFailureAlertChecking: 'Проверка новых сбоев уведомлений о наградах…',
    campaignNewFailureAlertLoadFailed: 'Не удалось проверить новые сбои уведомлений. Обновите страницу и повторите попытку.',
    campaignQueueHealthTitle: 'Состояние очереди VIP-уведомлений о наградах',
    campaignQueueHealthSeparate: 'Ожидающие уведомления считаются просроченными через 10 минут; отправка учитывается после истечения аренды. Терминальные сбои DM и публичные объявления не включены.',
    campaignQueueHealthPending: 'Просрочено в ожидании: {count}',
    campaignQueueHealthExpiredSending: 'Истекшая аренда отправки: {count}',
    campaignQueueHealthOldest: 'Ожидает дольше всего: {time} · {minutes} мин',
    campaignQueueHealthEmpty: 'Просроченных ожидающих уведомлений и истекших аренд отправки нет.',
    campaignQueueHealthChecking: 'Проверка очереди запланированных наград…',
    campaignQueueHealthLoadFailed: 'Не удалось загрузить состояние очереди наград. Обновите страницу.',
    announcementStatus: 'Объявление',
    announcementPending: 'В очереди',
    announcementDelivered: 'Опубликовано',
    announcementFailed: 'Ошибка отправки',
    announcementCancelled: 'Не отправлено: кампания завершилась',
    announcementLegacy: 'Старая кампания без объявления',
    campaignStop: 'Остановить кампанию',
    campaignStopping: 'Остановка…',
    campaignStopConfirm: 'Остановить эту кампанию? Уже выданные VIP-дни сохранятся, новые выдачи прекратятся.',
    campaignStoppedNotice: 'Кампания остановлена. Уже выданные VIP-дни не отозваны.',
    campaignStopFailed: 'Не удалось остановить кампанию. Обновите страницу и попробуйте снова.',
  },
};

export interface UserProfile {
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
  age?: number | null;
  zodiac?: string;
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
  vip_expiry?: string | null;
  interest_received?: boolean;
  interest_cooldown_until?: string | null;
  interest_state_known?: boolean;
}

type ProfileCompletionMissingFields = {
  dob: boolean;
  gender: boolean;
  height: boolean;
  weight: boolean;
};

type AdminProfileActionCopy = {
  resetSingleConfirm: (name: string) => string;
  resetSingleDone: string;
  resetAllConfirm: string;
  resetAllDone: string;
  swapSexButton: string;
  swapSexConfirm: (name: string, from: string, to: string) => string;
  swapSexDone: (gender: string) => string;
  swapSexUnavailable: string;
  swapSexFailed: string;
};

const adminProfileActionCopy: Record<LangKey, AdminProfileActionCopy> = {
  en: {
    resetSingleConfirm: (name) => `Remove ${name || "this user's"} age? This clears only their date of birth.`,
    resetSingleDone: 'Age removed. Other profile information is unchanged.',
    resetAllConfirm: 'Remove only the date of birth (age) from all users? Everyone will see the complete-info screen on their next login.',
    resetAllDone: 'Age removed from all users.',
    swapSexButton: 'Force swap sex',
    swapSexConfirm: (name, from, to) => `Change ${name || 'this user'} from ${from} to ${to}?`,
    swapSexDone: (gender) => `Gender changed to ${gender}.`,
    swapSexUnavailable: 'Only profiles marked man or woman can be swapped.',
    swapSexFailed: 'Could not swap sex.',
  },
  'zh-CN': {
    resetSingleConfirm: (name) => `移除${name || '此用户'}的年龄？此操作只会清除出生日期。`,
    resetSingleDone: '年龄已移除，其他个人资料保持不变。',
    resetAllConfirm: '仅移除所有用户的出生日期（年龄）？所有用户下次登录时会看到完善资料页面。',
    resetAllDone: '已移除所有用户的年龄。',
    swapSexButton: '强制切换性别',
    swapSexConfirm: (name, from, to) => `将${name || '此用户'}的性别从${from}切换为${to}？`,
    swapSexDone: (gender) => `性别已更改为${gender}。`,
    swapSexUnavailable: '仅可切换标记为男性或女性的个人资料。',
    swapSexFailed: '无法切换性别。',
  },
  'zh-TW': {
    resetSingleConfirm: (name) => `移除${name || '此用戶'}的年齡？此操作只會清除出生日期。`,
    resetSingleDone: '年齡已移除，其他個人資料保持不變。',
    resetAllConfirm: '只移除所有用戶的出生日期（年齡）？所有用戶下次登入時會看到完善資料頁面。',
    resetAllDone: '已移除所有用戶的年齡。',
    swapSexButton: '強制切換性別',
    swapSexConfirm: (name, from, to) => `將${name || '此用戶'}的性別由${from}切換為${to}？`,
    swapSexDone: (gender) => `性別已更改為${gender}。`,
    swapSexUnavailable: '只可切換標記為男性或女性的個人資料。',
    swapSexFailed: '無法切換性別。',
  },
  ja: {
    resetSingleConfirm: (name) => `${name || 'このユーザー'}の年齢を削除しますか？生年月日だけを消去します。`,
    resetSingleDone: '年齢を削除しました。他のプロフィール情報は変更されていません。',
    resetAllConfirm: '全ユーザーの生年月日（年齢）だけを削除しますか？次回ログイン時にプロフィール入力画面が表示されます。',
    resetAllDone: '全ユーザーの年齢を削除しました。',
    swapSexButton: '性別を強制変更',
    swapSexConfirm: (name, from, to) => `${name || 'このユーザー'}の性別を${from}から${to}に変更しますか？`,
    swapSexDone: (gender) => `性別を${gender}に変更しました。`,
    swapSexUnavailable: '男性または女性として登録されたプロフィールのみ変更できます。',
    swapSexFailed: '性別を変更できませんでした。',
  },
  ko: {
    resetSingleConfirm: (name) => `${name || '이 사용자'}의 나이를 삭제할까요? 생년월일만 지웁니다.`,
    resetSingleDone: '나이가 삭제되었습니다. 다른 프로필 정보는 그대로 유지됩니다.',
    resetAllConfirm: '모든 사용자의 생년월일(나이)만 삭제할까요? 다음 로그인 때 프로필 입력 화면이 표시됩니다.',
    resetAllDone: '모든 사용자의 나이가 삭제되었습니다.',
    swapSexButton: '성별 강제 변경',
    swapSexConfirm: (name, from, to) => `${name || '이 사용자'}의 성별을 ${from}에서 ${to}(으)로 변경할까요?`,
    swapSexDone: (gender) => `성별이 ${gender}(으)로 변경되었습니다.`,
    swapSexUnavailable: '남성 또는 여성으로 표시된 프로필만 변경할 수 있습니다.',
    swapSexFailed: '성별을 변경하지 못했습니다.',
  },
  ru: {
    resetSingleConfirm: (name) => `Удалить возраст пользователя «${name || 'этого пользователя'}»? Будет удалена только дата рождения.`,
    resetSingleDone: 'Возраст удалён. Остальные данные профиля не изменены.',
    resetAllConfirm: 'Удалить только даты рождения (возраст) у всех пользователей? При следующем входе появится экран заполнения профиля.',
    resetAllDone: 'Возраст удалён у всех пользователей.',
    swapSexButton: 'Принудительно сменить пол',
    swapSexConfirm: (name, from, to) => `Изменить пол пользователя «${name || 'этого пользователя'}» с «${from}» на «${to}»?`,
    swapSexDone: (gender) => `Пол изменён на «${gender}».`,
    swapSexUnavailable: 'Можно изменить только профили с указанным полом «мужчина» или «женщина».',
    swapSexFailed: 'Не удалось изменить пол.',
  },
};

const formatDistanceBigUnit = (meters?: number) => {
  if (meters === undefined || meters === null) return '0m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${meters}m`;
};

const formatTagText = (str: string) => {
  if (!str) return '';
  return str.replace(/\s*[(（][^)）]*[)）]/g, '').trim();
};

// Tag-match helpers: when viewing another user's card, a tag lights up only if
// it matches the viewer's own preference filter. Versatile matches all roles
// except Side; "Doesn't matter"/Anywhere (or Off/null) matches everything.
const tagMatchesRole = (filterVal: string | null, userRole: string | null) => {
  if (!filterVal || filterVal === 'Off') return true;
  if (filterVal === 'Versatile') return userRole !== 'Side';
  if (filterVal === 'VT') return userRole === 'Versatile' || userRole === 'Top';
  if (filterVal === 'VB') return userRole === 'Versatile' || userRole === 'Bottom';
  return filterVal === userRole;
};
const tagMatchesSafety = (filterVal: string | null, userPref: string | null) => {
  if (!filterVal || filterVal === 'Off') return true;
  return filterVal === userPref;
};
const tagMatchesPlaystyle = (filterVal: string | null, userPref: string | null) => {
  return matchesPlaystyleFilter(filterVal, userPref);
};
const tagMatchesHowMany = (filterVal: string | null, userPref: string | null) => {
  return matchesHowManyFilter(filterVal, userPref);
};
const tagMatchesWhere = (filterVal: string | null, userWhere: string | null) => {
  if (!filterVal || filterVal === 'Off') return true;
  return filterVal === userWhere;
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

const parseHeightMeters = (height?: string | null): number | null => {
  if (!height) return null;
  const m = String(height).match(/(\d+(?:\.\d+)?)\s*m/i);
  if (m) {
    const v = parseFloat(m[1]);
    return v >= 0.5 && v <= 3 ? v : null;
  }
  const cm = String(height).match(/(\d+(?:\.\d+)?)\s*cm/i);
  if (cm) {
    const v = parseFloat(cm[1]);
    return v >= 50 && v <= 300 ? v / 100 : null;
  }
  return null;
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
  if (!isoString) return 'offline';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'online';
    if (diffMins < 60) return `mAgo:${diffMins}`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `hAgo:${diffHours}`;
    return `dAgo:${Math.floor(diffHours / 24)}`;
  } catch {
    return 'offline';
  }
};

// Render a formatLastSeenBigUnit token with the current language
const renderLastSeenBigUnit = (token: string, t: (key: string) => string) => {
  if (token.startsWith('mAgo:')) return t('mAgo').replace('{n}', token.slice(5));
  if (token.startsWith('hAgo:')) return t('hAgo').replace('{n}', token.slice(5));
  if (token.startsWith('dAgo:')) return t('dAgo').replace('{n}', token.slice(5));
  return t(token);
};

const isOnlineWithin15Min = (isoString?: string | null) => {
  if (!isoString) return false;
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = diffMs / 60000;
    return diffMins <= 15 && diffMins >= 0;
  } catch {
    return false;
  }
};

const getNextRaffleCloseAt = (now: number) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const isBeforeThisMonthDraw = day === 1 && hour < 20;
  const targetMonthIndex = month - 1 + (isBeforeThisMonthDraw ? 0 : 1);
  // Hong Kong is UTC+8 year-round, so 20:00 local is 12:00 UTC.
  return Date.UTC(year, targetMonthIndex, 1, 12, 0, 0);
};

const formatRaffleCountdown = (deadline: number, now: number, lang: LangKey) => {
  const remainingSeconds = Math.max(0, Math.floor((deadline - now) / 1000));
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return raffleUiCopy[lang].countdown
    .replace('{d}', String(days))
    .replace('{h}', pad(hours))
    .replace('{m}', pad(minutes))
    .replace('{s}', pad(seconds));
};

export default function App({ config }: { config: AppRuntimeConfig }) {
  const initialEntry = resolveAppEntry(
    config,
    window.Telegram?.WebApp?.initDataUnsafe?.start_param,
    window.location.search,
  );
  const verifiedBotKeyRef = useRef<'botA' | 'botB' | null>(null);
  const [lang, setLang] = useState<LangKey>('en');
  const t = (key: string) => translations[lang]?.[key] || translations['en'][key] || key;
  const [view, setView] = useState<'grid' | 'map'>(() => getDefaultDiscoveryView(initialEntry.modules) || 'grid');
  const [hasOpenedMap, setHasOpenedMap] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const hasMainProfileImage = hasUploadedMainProfileImage(currentUser?.avatar);
  const currentUserRef = useRef<UserProfile | null>(null);
  currentUserRef.current = currentUser;
  const currentUserId = currentUser?.id;
  const raffleUserId = currentUserId;
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 22.3193, lng: 114.1694 });
  const [isReady, setIsReady] = useState<boolean>(false);
  const [startupError, setStartupError] = useState<string>('');
  const [showProfileSetup, setShowProfileSetup] = useState<boolean>(false);
  const [profileCompletionMissingFields, setProfileCompletionMissingFields] =
    useState<ProfileCompletionMissingFields>({
      dob: true,
      gender: true,
      height: true,
      weight: true,
    });
  const [isUnderageLocked, setIsUnderageLocked] = useState<boolean>(false);
  const [isLocationDenied, setIsLocationDenied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [filterAccessNotice, setFilterAccessNotice] = useState<'ended' | 'restored' | ''>('');
  const [isFilterAccessRenewing, setIsFilterAccessRenewing] = useState<boolean>(false);
  const filterAccessPurchaseInProgressRef = useRef(false);
  const [pendingAccessRecheck, setPendingAccessRecheck] = useState<PendingAccessRecheck | null>(null);
  const [pendingAccessRecoveryAccountId, setPendingAccessRecoveryAccountId] = useState<string | null>(null);
  const [isPaymentRetryRunning, setIsPaymentRetryRunning] = useState(false);
  const pendingAccessRecheckRef = useRef<PendingAccessRecheck | null>(null);
  const pendingAccessRecoverySyncRef = useRef<Promise<void>>(Promise.resolve());
  const accessRecheckAttemptsRef = useRef<{ key: string; attempts: number }>({ key: '', attempts: 0 });
  const paidProfileVerificationInProgressRef = useRef(false);
  const applyOwnProfileRef = useRef<(profile: UserProfile) => void>(() => {});
  const workerPostRef = useRef<
    (path: string, body?: Record<string, unknown>) => Promise<any>
  >(async () => { throw new Error('Worker request handler is not initialized.'); });
  const fetchUsersDataRef = useRef<(() => Promise<void>) | null>(null);
  const confirmPendingAccessRef = useRef<
    (marker: PendingAccessRecheck, profile: UserProfile) => boolean
  >(() => false);
  const loadFilterPrefsRef = useRef<(() => void) | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isVip, setIsVip] = useState<boolean>(false);
  const [isTelegramPremium, setIsTelegramPremium] = useState<boolean>(false);
  const [vipExpiry, setVipExpiry] = useState<string | null>(null);
  const previousFilterAccessRef = useRef<{ accountId: string | null; active: boolean }>({
    accountId: null,
    active: false,
  });
  const filterAccessNoticeEventRef = useRef<string | null>(null);
  const [raffleClock, setRaffleClock] = useState<number>(Date.now());
  const [raffleServerOffset, setRaffleServerOffset] = useState<number>(0);
  const [globalVipUntil, setGlobalVipUntil] = useState<number>(0);
  const [filterSubUntil, setFilterSubUntil] = useState<number>(0);
  const filterSubUntilRef = useRef<number>(0);
  const {
    temporaryVipActive,
    globalVipActive,
    filterSubscriptionActive,
    paidUnlocked,
    filterAccessActive,
  } = getActiveAccessState({
    now: raffleClock,
    isAdmin,
    isVipRole: isVip,
    vipExpiry,
    globalVipUntil,
    filterSubUntil,
  });
  const canUseHideNonMatching = hasFilterOptionAccess('hideNonMatching', {
    filterAccessActive,
    telegramPremium: isTelegramPremium,
  });
  // VIP (personal or global) unlocks every paid function, just like admin.
  const [roles, setRoles] = useState<{ username: string; role: string }[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesLoadError, setRolesLoadError] = useState('');
  const [showAdminMenu, setShowAdminMenu] = useState<boolean>(false);
  const [showProfileSetupPreview, setShowProfileSetupPreview] = useState(false);
  const profileSetupPreviewDialogRef = useRef<HTMLDivElement | null>(null);
  const [showRolesModal, setShowRolesModal] = useState<boolean>(false);
  const [showVipPeriods, setShowVipPeriods] = useState<boolean>(false);
  const [vipGrantWindowEnabled, setVipGrantWindowEnabled] = useState<boolean>(false);
  const [vipGrantWindow, setVipGrantWindow] = useState<VipGrantWindow>('today');
  const [randomVipDaysEnabled, setRandomVipDaysEnabled] = useState<boolean>(false);
  const [allowNewVipUsers, setAllowNewVipUsers] = useState<boolean>(false);
  const [savingVipGrant, setSavingVipGrant] = useState<boolean>(false);
  const vipGrantSaveLockRef = useRef<boolean>(false);
  const [vipGrantNotice, setVipGrantNotice] = useState<VipGrantNotice | null>(null);
  const [vipGrantAcknowledging, setVipGrantAcknowledging] = useState(false);
  const [vipGrantAcknowledgementError, setVipGrantAcknowledgementError] = useState('');
  const vipGrantAcknowledgementLockRef = useRef(false);
  const [showVipCampaignsModal, setShowVipCampaignsModal] = useState(false);
  const [showPaymentReview, setShowPaymentReview] = useState(false);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [paymentsHasMore, setPaymentsHasMore] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState('');
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [rafflePaymentIntents, setRafflePaymentIntents] =
    useState<RafflePaymentReviewIntent[]>([]);
  const [rafflePaymentHasMore, setRafflePaymentHasMore] = useState(false);
  const [rafflePaymentLoading, setRafflePaymentLoading] = useState(false);
  const [rafflePaymentError, setRafflePaymentError] = useState('');
  const [rafflePaymentSearch, setRafflePaymentSearch] = useState('');
  const [raffleRecoveringIntentId, setRaffleRecoveringIntentId] = useState<string | null>(null);
  const [raffleRecoveryNotice, setRaffleRecoveryNotice] = useState('');
  const [raffleRecoveryError, setRaffleRecoveryError] = useState('');
  const [passLookupSearch, setPassLookupSearch] = useState('');
  const [passLookupSearchBy, setPassLookupSearchBy] =
    useState<PassPaymentSearchBy>('telegram_id');
  const [passLookupLoading, setPassLookupLoading] = useState(false);
  const [passLookupError, setPassLookupError] = useState('');
  const [passLookupResult, setPassLookupResult] = useState<PassPaymentLookup | null>(null);
  const passPaymentLookupRequestRef = useRef(0);
  const [vipCampaigns, setVipCampaigns] = useState<VipCampaign[]>([]);
  const [vipCampaignsHasMore, setVipCampaignsHasMore] = useState(false);
  const [vipCampaignsLoading, setVipCampaignsLoading] = useState(false);
  const [vipCampaignsError, setVipCampaignsError] = useState('');
  const [vipCampaignsNotice, setVipCampaignsNotice] = useState('');
  const [stoppingVipCampaignId, setStoppingVipCampaignId] = useState<string | null>(null);
  const [failedRewardCampaignId, setFailedRewardCampaignId] = useState<string | null>(null);
  const [failedRewardClaims, setFailedRewardClaims] = useState<VipFailedRewardClaim[]>([]);
  const [failedRewardClaimsHasMore, setFailedRewardClaimsHasMore] = useState(false);
  const [failedRewardClaimsLoading, setFailedRewardClaimsLoading] = useState(false);
  const [failedRewardClaimsError, setFailedRewardClaimsError] = useState('');
  const [crossCampaignFailedRewardSearch, setCrossCampaignFailedRewardSearch] = useState('');
  const [crossCampaignFailedRewardSourceBot, setCrossCampaignFailedRewardSourceBot] =
    useState<'all' | 'botA' | 'botB'>('all');
  const [crossCampaignFailedRewardActiveSearch, setCrossCampaignFailedRewardActiveSearch] = useState('');
  const [crossCampaignFailedRewardActiveSourceBot, setCrossCampaignFailedRewardActiveSourceBot] =
    useState<'all' | 'botA' | 'botB'>('all');
  const [crossCampaignFailedRewardSearched, setCrossCampaignFailedRewardSearched] = useState(false);
  const [crossCampaignFailedRewardClaims, setCrossCampaignFailedRewardClaims] =
    useState<VipFailedRewardClaim[]>([]);
  const [crossCampaignFailedRewardClaimsHasMore, setCrossCampaignFailedRewardClaimsHasMore] =
    useState(false);
  const [crossCampaignFailedRewardClaimsLoading, setCrossCampaignFailedRewardClaimsLoading] =
    useState(false);
  const [crossCampaignFailedRewardClaimsError, setCrossCampaignFailedRewardClaimsError] = useState('');
  const [retryingFailedRewardClaimId, setRetryingFailedRewardClaimId] = useState<string | null>(null);
  const [retryAuditCampaignId, setRetryAuditCampaignId] = useState<string | null>(null);
  const [retryAuditRecords, setRetryAuditRecords] = useState<VipRewardRetryAudit[]>([]);
  const [retryAuditHasMore, setRetryAuditHasMore] = useState(false);
  const [retryAuditLoading, setRetryAuditLoading] = useState(false);
  const [retryAuditError, setRetryAuditError] = useState('');
  const vipCampaignListRequestRef = useRef(0);
  const vipFailedRewardRequestRef = useRef(0);
  const crossCampaignFailedRewardRequestRef = useRef(0);
  const vipRetryAuditRequestRef = useRef(0);
  const paymentReviewRequestRef = useRef(0);
  const rafflePaymentReviewRequestRef = useRef(0);
  const raffleRecoveryRequestRef = useRef(0);
  const [vipFailureAlert, setVipFailureAlert] = useState<VipFailureAlertSummary | null>(null);
  const [vipFailureAlertLoading, setVipFailureAlertLoading] = useState(false);
  const [vipFailureAlertError, setVipFailureAlertError] = useState('');
  const vipFailureAlertRequestRef = useRef(0);
  const vipFailureAlertAckRequestRef = useRef(0);
  const vipFailureAlertAcknowledgedCursorRef = useRef<string | null>(null);
  const vipFailureAlertOwnerRef = useRef<string | null>(null);
  const vipFailureAlertPollingUserRef = useRef<string | null>(null);
  const loadNewVipFailureAlertsRef = useRef<() => Promise<void>>(async () => {});
  const [vipRewardQueueHealth, setVipRewardQueueHealth] =
    useState<VipRewardNotificationQueueHealth | null>(null);
  const [vipRewardQueueHealthLoading, setVipRewardQueueHealthLoading] = useState(false);
  const [vipRewardQueueHealthError, setVipRewardQueueHealthError] = useState('');
  const vipRewardQueueHealthRequestRef = useRef(0);
  const loadVipRewardQueueHealthRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!showProfileSetupPreview) return;
    if (!isAdmin) {
      setShowProfileSetupPreview(false);
      return;
    }

    const dialog = profileSetupPreviewDialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    focusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowProfileSetupPreview(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = focusableElements();
      const first = focusables[0];
      const last = focusables.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [showProfileSetupPreview, isAdmin]);

  useEffect(() => {
    vipCampaignListRequestRef.current += 1;
    vipFailedRewardRequestRef.current += 1;
    crossCampaignFailedRewardRequestRef.current += 1;
    vipFailureAlertRequestRef.current += 1;
    vipFailureAlertAckRequestRef.current += 1;
    vipFailureAlertAcknowledgedCursorRef.current = null;
    vipFailureAlertOwnerRef.current = null;
    vipFailureAlertPollingUserRef.current = null;
    vipRewardQueueHealthRequestRef.current += 1;
    setShowVipCampaignsModal(false);
    setVipCampaigns([]);
    setVipCampaignsHasMore(false);
    setVipCampaignsLoading(false);
    setVipCampaignsError('');
    setVipCampaignsNotice('');
    setStoppingVipCampaignId(null);
    setFailedRewardCampaignId(null);
    setFailedRewardClaims([]);
    setFailedRewardClaimsHasMore(false);
    setFailedRewardClaimsLoading(false);
    setFailedRewardClaimsError('');
    setCrossCampaignFailedRewardSearch('');
    setCrossCampaignFailedRewardSourceBot('all');
    setCrossCampaignFailedRewardActiveSearch('');
    setCrossCampaignFailedRewardActiveSourceBot('all');
    setCrossCampaignFailedRewardSearched(false);
    setCrossCampaignFailedRewardClaims([]);
    setCrossCampaignFailedRewardClaimsHasMore(false);
    setCrossCampaignFailedRewardClaimsLoading(false);
    setCrossCampaignFailedRewardClaimsError('');
    setRetryingFailedRewardClaimId(null);
    setVipFailureAlert(null);
    setVipFailureAlertLoading(false);
    setVipFailureAlertError('');
    setVipRewardQueueHealth(null);
    setVipRewardQueueHealthLoading(false);
    setVipRewardQueueHealthError('');
  }, [currentUser?.id]);
  useEffect(() => {
    const userId = currentUser?.id;
    const eventId = vipFailureAlert?.cursor?.eventId;
    if (!showVipCampaignsModal || !userId || !eventId ||
        vipFailureAlertOwnerRef.current !== userId) return;
    const lastAcknowledgedEventId = vipFailureAlertAcknowledgedCursorRef.current;
    if (lastAcknowledgedEventId && BigInt(lastAcknowledgedEventId) >= BigInt(eventId)) return;

    const requestSequence = ++vipFailureAlertAckRequestRef.current;
    void (async () => {
      try {
        const [result, { parseVipFailureAlertAcknowledgement }] = await Promise.all([
          workerPostRef.current('/api/vip-campaigns', {
            action: 'acknowledge_failure_alerts',
            afterFailureEventId: eventId,
          }),
          loadVipCampaignPanelModule(),
        ]);
        const cursor = parseVipFailureAlertAcknowledgement(result, eventId);
        if (requestSequence !== vipFailureAlertAckRequestRef.current || currentUser?.id !== userId) return;
        vipFailureAlertAcknowledgedCursorRef.current = cursor.eventId;
        setVipFailureAlertError('');
      } catch (error) {
        if (requestSequence === vipFailureAlertAckRequestRef.current && currentUser?.id === userId) {
          console.error('Could not acknowledge new VIP reward notification failures:', error);
          setVipFailureAlertError(vipGrantCopy[lang].campaignNewFailureAlertLoadFailed);
        }
      }
    })();
  }, [showVipCampaignsModal, currentUser?.id, vipFailureAlert?.cursor?.eventId, lang]);
  useEffect(() => {
    const userId = currentUser?.id;
    if (!showVipCampaignsModal || !isAdmin || !userId) {
      vipFailureAlertPollingUserRef.current = null;
      return;
    }

    vipFailureAlertPollingUserRef.current = userId;
    let active = true;
    let stopPolling = () => {};
    void loadVipCampaignPanelModule()
      .then(({ startVipFailureAlertPolling }) => {
        if (!active || vipFailureAlertPollingUserRef.current !== userId) return;
        stopPolling = startVipFailureAlertPolling({
          enabled: true,
          userId,
          timer: window,
          onPoll: () => {
            if (vipFailureAlertPollingUserRef.current === userId) {
              void loadNewVipFailureAlertsRef.current();
              void loadVipRewardQueueHealthRef.current();
            }
          },
        });
      })
      .catch((error) => {
        if (!active || vipFailureAlertPollingUserRef.current !== userId) return;
        console.error('Could not start VIP reward failure alert polling:', error);
        setVipFailureAlertError(vipGrantCopy[lang].campaignNewFailureAlertLoadFailed);
      });
    return () => {
      active = false;
      vipFailureAlertRequestRef.current += 1;
      vipRewardQueueHealthRequestRef.current += 1;
      if (vipFailureAlertPollingUserRef.current === userId) {
        vipFailureAlertPollingUserRef.current = null;
      }
      stopPolling();
    };
  }, [showVipCampaignsModal, isAdmin, currentUser?.id, lang]);
  useEffect(() => {
    paymentReviewRequestRef.current += 1;
    rafflePaymentReviewRequestRef.current += 1;
    raffleRecoveryRequestRef.current += 1;
    passPaymentLookupRequestRef.current += 1;
    setShowPaymentReview(false);
    setPaymentRecords([]);
    setPaymentsHasMore(false);
    setPaymentsLoading(false);
    setPaymentsError('');
    setPaymentsSearch('');
    setRafflePaymentIntents([]);
    setRafflePaymentHasMore(false);
    setRafflePaymentLoading(false);
    setRafflePaymentError('');
    setRafflePaymentSearch('');
    setRaffleRecoveringIntentId(null);
    setRaffleRecoveryNotice('');
    setRaffleRecoveryError('');
    setPassLookupSearch('');
    setPassLookupSearchBy('telegram_id');
    setPassLookupLoading(false);
    setPassLookupError('');
    setPassLookupResult(null);
  }, [currentUser?.id, isAdmin]);
  const [showFlyingPriceEditor, setShowFlyingPriceEditor] = useState<boolean>(false);
  const [flyingPriceDraft, setFlyingPriceDraft] = useState<string>('0');
  const [savingFlyingPrice, setSavingFlyingPrice] = useState<boolean>(false);
  const [flyingMessagePrice, setFlyingMessagePrice] = useState<number>(0);
  const effectiveFlyingMessagePrice = paidUnlocked ? 0 : flyingMessagePrice;
  const [flyingMessageText, setFlyingMessageText] = useState<string>('');
  const [flyingMessages, setFlyingMessages] = useState<FlyingMessage[]>([]);
  const [raffleState, setRaffleState] = useState<RaffleState | null>(null);
  const [rafflePurchasing, setRafflePurchasing] = useState<boolean>(false);
  const [raffleNotice, setRaffleNotice] = useState<string>('');
  const raffleAnnouncementRoundRef = useRef<string | null>(null);
  const raffleAnnouncementOwnerRef = useRef<string | null>(null);
  const pendingRafflePurchaseRef = useRef<{
    intentId: string;
    accountId: string;
    expiresAt: number;
  } | null>(null);
  const settledRaffleIntentRef = useRef<{
    intentId: string;
    accountId: string;
    outcome: RafflePurchaseTerminalOutcome;
  } | null>(null);
  const applyRaffleStateRef = useRef<((value: RaffleState) => void) | null>(null);
  const refreshRaffleStateRef = useRef<(() => Promise<RaffleState>) | null>(null);
  const confirmRaffleTicketPurchaseRef = useRef<
    ((intentId: string, response: unknown) => RafflePurchaseOutcome) | null
  >(null);
  const [flyingMessageNoticeState, setFlyingMessageNoticeState] =
    useState<FlyingMessageNoticeState>(() => createFlyingMessageNotice());
  const flyingMessageNotice = flyingMessageNoticeState.message;
  const showFlyingMessageNotice = (message: string, persistent = false) => {
    setFlyingMessageNoticeState((current) =>
      getFlyingMessageNoticeAfterMessage(current, message, persistent),
    );
  };
  const dismissFlyingMessageNotice = () => {
    setFlyingMessageNoticeState(getFlyingMessageNoticeAfterDismissal());
  };
  const [sendingFlyingMessage, setSendingFlyingMessage] = useState<boolean>(false);
  const [flyingCooldownUntil, setFlyingCooldownUntil] = useState<number>(0);
  const [cooldownClock, setCooldownClock] = useState<number>(Date.now());
  const [newRoleUsername, setNewRoleUsername] = useState<string>('');
  const [newRole, setNewRole] = useState<'admin' | 'vip'>('vip');
  const [showStuffBubble, setShowStuffBubble] = useState<boolean>(false);
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletModuleLoaded, setWalletModuleLoaded] = useState(false);
  const [walletActionRequest, setWalletActionRequest] = useState(0);
  useEffect(() => { filterSubUntilRef.current = filterSubUntil; }, [filterSubUntil]);
  useEffect(() => {
    if (!isReady || walletModuleLoaded) return;
    const timeout = window.setTimeout(() => setWalletModuleLoaded(true), 1800);
    return () => window.clearTimeout(timeout);
  }, [isReady, walletModuleLoaded]);

  const handleWalletClick = () => {
    setWalletModuleLoaded(true);
    setWalletActionRequest((request) => request + 1);
  };

  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const [showScreenHelp, setShowScreenHelp] = useState(false);
  const [hideNonMatchingUsers, setHideNonMatchingUsers] = useState<boolean>(false);
  const [filterAgeOn, setFilterAgeOn] = useState<boolean>(false);
  const [filterAgeMin, setFilterAgeMin] = useState<number>(18);
  const [filterAgeMax, setFilterAgeMax] = useState<number>(60);
  const [filterHeightOn, setFilterHeightOn] = useState<boolean>(false);
  const [filterHeightMin, setFilterHeightMin] = useState<number>(140);
  const [filterHeightMax, setFilterHeightMax] = useState<number>(200);
  const [filterGenderVals, setFilterGenderVals] = useState<GenderFilterValue[]>([]);
  const vipEntitlementActive = isVip || temporaryVipActive || globalVipActive;
  const hkmoMenOnlyFilterLocked = isHkmoDateMenOnlyFilterLocked(
    verifiedBotKeyRef.current,
    vipEntitlementActive,
  );
  const effectiveFilterGenderVals = getEffectiveGenderFilterValues(
    filterGenderVals,
    verifiedBotKeyRef.current,
    vipEntitlementActive,
  );
  const [filterPrefMatcherOn, setFilterPrefMatcherOn] = useState<boolean>(true);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [interestSendingTo, setInterestSendingTo] = useState<string | null>(null);
  const [interestFeedback, setInterestFeedback] = useState<{
    profileId: string;
    state: 'sent' | 'cooldown' | 'unavailable' | 'failed';
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [showNoteBox, setShowNoteBox] = useState<boolean>(false);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [showProfileEditModal, setShowProfileEditModal] = useState<boolean>(false);
  const [isGamesMenuOpen, setIsGamesMenuOpen] = useState<boolean>(false);
  const [entryId, setEntryId] = useState<AppEntryId>(() => initialEntry.id);
  const entry = config.entries[entryId];
  const gridFilterEnabled = entry.modules.gridFilter;
  const mapModuleEnabled = entry.modules.map;
  const starRaffleEnabled = entry.modules.starRaffle;
  const flyingMessageEnabled = entry.modules.flyingMessage;
  useEffect(() => {
    const defaultView = getDefaultDiscoveryView(entry.modules);
    setView(defaultView || 'grid');
    if (defaultView === 'map') setHasOpenedMap(true);
    setShowFilterDropdown(false);
    setShowScreenHelp(false);
    setIsGamesMenuOpen(false);
    if (!flyingMessageEnabled) setShowFlyingPriceEditor(false);
  }, [entry.id, entry.modules, gridFilterEnabled, mapModuleEnabled, flyingMessageEnabled]);
  const [dob, setDob] = useState<string>('');
  const [gender, setGender] = useState<string>('man');
  const [seeking, setSeeking] = useState<string>('women');
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [rolePref, setRolePref] = useState<string>('Versatile');
  const [safetyPref, setSafetyPref] = useState<string>('Safe');
  const [playstylePref, setPlaystylePref] = useState<string>('Clean');
  const [howManyPref, setHowManyPref] = useState<string>('DoesntMatter');
  const [wherePref, setWherePref] = useState<string | null>(null);
  const [nonManMode, setNonManMode] = useState<string>('Meet up - You are visible on grid and map');
  const [hideAge, setHideAge] = useState<boolean>(false);
  const [hideAgeExpiry, setHideAgeExpiry] = useState<string | null>(null);
  const [hideAgeNotice, setHideAgeNotice] = useState<'ended' | 'active' | ''>('');
  const [isHideAgeRenewing, setIsHideAgeRenewing] = useState<boolean>(false);
  const hideAgePurchaseInProgressRef = useRef(false);
  const hideAgeSyncTargetRef = useRef<number>(0);
  const [invisibleExpiry, setInvisibleExpiry] = useState<string | null>(null);
  const [invisibleNotice, setInvisibleNotice] = useState<'ended' | 'active' | ''>('');
  const [isInvisibleRenewing, setIsInvisibleRenewing] = useState<boolean>(false);
  const invisiblePurchaseInProgressRef = useRef(false);
  const [gridVisible, setGridVisible] = useState<boolean>(true);
  const [mapVisible, setMapVisible] = useState<boolean>(false);
  const [filterRoleVal, setFilterRoleVal] = useState<string | null>(null);
  const [filterSafetyVal, setFilterSafetyVal] = useState<string | null>(null);
  const [filterPlaystyleVal, setFilterPlaystyleVal] = useState<string | null>(null);
  const [filterHowManyVal, setFilterHowManyVal] = useState<string>(DEFAULT_HOW_MANY_FILTER);
  const [filterWhereVal, setFilterWhereVal] = useState<string | null>(null);

  const filterRoleCycleOptions = FILTER_CYCLE_OPTIONS.role;
  const filterSafetyCycleOptions = FILTER_CYCLE_OPTIONS.safety;
  const filterPlaystyleCycleOptions = FILTER_CYCLE_OPTIONS.playstyle;
  const filterWhereCycleOptions = FILTER_CYCLE_OPTIONS.where;

  const cycleNext = (current: string, options: readonly string[]) => {
    const idx = options.indexOf(current);
    if (idx === -1 || idx === options.length - 1) return options[0];
    return options[idx + 1];
  };
  const cycleWhere = (current: string | null, options: readonly (string | null)[]) => {
    const idx = options.indexOf(current);
    if (idx === -1 || idx === options.length - 1) return options[0];
    return options[idx + 1];
  };

  const heightOptions = buildProfileHeightOptions(height);
  const weightOptions = buildProfileWeightOptions();

  const getActiveBotKey = () => {
    if (verifiedBotKeyRef.current) return verifiedBotKeyRef.current;
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    return resolveAppEntry(config, startParam || config.defaultStartParam, window.location.search).botKey;
  };

  const workerPost = async (path: string, body: Record<string, unknown> = {}) => {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) throw new Error('Open Who’s Nearby from Telegram to continue.');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      WORKER_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`${PAYMENT_WORKER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, initData, bot: getActiveBotKey() }),
        signal: controller.signal,
      });
      let result: any = {};
      try { result = await response.json(); } catch {}
      if (!response.ok) {
        const error = new Error(result.error || `Request failed (${response.status})`) as Error & {
          retryAfter?: number;
          status?: number;
          upstreamStatus?: number;
          notificationStatus?: string;
        };
        error.status = response.status;
        if (typeof result.notificationStatus === 'string') {
          error.notificationStatus = result.notificationStatus;
        }
        const upstreamStatus = Number(result.upstreamStatus);
        if (Number.isInteger(upstreamStatus) && upstreamStatus >= 400) error.upstreamStatus = upstreamStatus;
        const retryAfter = Number(result.retryAfter || response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
        throw error;
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('The server took too long to respond. Check your connection and try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };
  workerPostRef.current = workerPost;

  const enqueuePendingAccessRecoverySync = (operation: () => Promise<unknown>) => {
    const next = pendingAccessRecoverySyncRef.current.then(
      async () => { await operation(); },
      async () => { await operation(); },
    );
    pendingAccessRecoverySyncRef.current = next.catch(() => {});
    return next;
  };

  const queuePendingAccessRecoverySave = (marker: PendingAccessRecheck) =>
    enqueuePendingAccessRecoverySync(() =>
      workerPostRef.current('/api/access-recovery/save', { marker }),
    ).catch((error) => {
      console.warn('Pending payment recovery could not be saved to the Worker.', error);
    });

  const persistPendingAccessRecheck = async (
    input: Parameters<typeof createPendingAccessRecheck>[0],
  ): Promise<PendingAccessRecheck | null> => {
    const marker = createPendingAccessRecheck(input);
    if (!marker) return null;
    try { savePendingAccessRecheck(localStorage, marker); } catch {}
    pendingAccessRecheckRef.current = marker;
    setPendingAccessRecheck(marker);
    await queuePendingAccessRecoverySave(marker);
    return marker;
  };

  const clearPendingAccessRecheck = (expected?: PendingAccessRecheck | null) => {
    if (!expected) return;
    let stored: PendingAccessRecheck | null = null;
    try { stored = loadPendingAccessRecheck(localStorage, null); } catch {}
    if (stored && (
      stored.accountId !== expected.accountId ||
      stored.entitlement !== expected.entitlement ||
      stored.startedAt !== expected.startedAt
    )) return;
    try { clearPendingAccessRecheckStorage(localStorage, expected); } catch {}
    void enqueuePendingAccessRecoverySync(() =>
      workerPostRef.current('/api/access-recovery/clear', { marker: expected }),
    ).catch((error) => {
      console.warn('Pending payment recovery could not be cleared from the Worker.', error);
    });
    setPendingAccessRecheck((current) => {
      if (current &&
          (current.accountId !== expected.accountId || current.startedAt !== expected.startedAt)) {
        return current;
      }
      if (pendingAccessRecheckRef.current?.accountId === expected.accountId &&
          pendingAccessRecheckRef.current?.startedAt === expected.startedAt) {
        pendingAccessRecheckRef.current = null;
      }
      return null;
    });
  };

  const hasPendingPaymentVerification = (
    accountId = currentUserRef.current?.id,
  ) => {
    if (typeof accountId !== 'string' || !accountId.trim()) return false;
    if (pendingAccessRecoveryAccountId !== accountId) return true;
    const now = Date.now();
    let stored: PendingAccessRecheck | null = null;
    try { stored = loadPendingAccessRecheck(localStorage, accountId, now); } catch {}
    const inMemory = pendingAccessRecheckRef.current;
    return hasUnresolvedPaidPurchase(stored, now) ||
      (inMemory?.accountId === accountId && hasUnresolvedPaidPurchase(inMemory, now));
  };

  const formatAdminFailure = (error: unknown, fallback: string) => {
    if (!(error instanceof Error)) return fallback;
    const details = error as Error & { status?: number; upstreamStatus?: number };
    const parts = [
      details.status ? `HTTP ${details.status}` : '',
      details.upstreamStatus ? `database ${details.upstreamStatus}` : '',
      error.message,
    ].filter(Boolean);
    return parts.length ? `${fallback} (${parts.join(' · ')})` : fallback;
  };

  const mergeFlyingMessages = (incoming: FlyingMessage[]) => {
    const cutoff = Date.now() - 10_000;
    setFlyingMessages((current) => {
      const combined = new Map<string, FlyingMessage>();
      for (const message of current) {
        if (Date.parse(message.created_at) >= cutoff) combined.set(message.id, message);
      }
      for (const message of incoming) {
        if (
          message &&
          typeof message.id === 'string' &&
          typeof message.text === 'string' &&
          typeof message.created_at === 'string' &&
          Date.parse(message.created_at) >= cutoff
        ) {
          combined.set(message.id, message);
        }
      }
      return [...combined.values()].slice(-24);
    });
  };

  const applyRaffleState = (value: RaffleState) => {
    if (!value || typeof value !== 'object') return;
    setRaffleState(value);
    const serverNow = Date.parse(value.serverNow);
    if (Number.isFinite(serverNow)) {
      const offset = serverNow - Date.now();
      setRaffleServerOffset(offset);
      setRaffleClock(Date.now() + offset);
    }

    const pendingPurchase = pendingRafflePurchaseRef.current;
    if (pendingPurchase && Date.now() > pendingPurchase.expiresAt) {
      pendingRafflePurchaseRef.current = null;
    }

    const draw = value.latestDraw;
    if (!draw?.roundKey || raffleAnnouncementRoundRef.current === draw.roundKey) return;
    raffleAnnouncementRoundRef.current = draw.roundKey;
    const copy = raffleUiCopy[lang];
    const prizeTitles = copy.prizes;
    const winners = Array.isArray(draw.winners) ? draw.winners : [];
    const messages = winners
      .filter((winner) => winner.username && prizeTitles[winner.prizeKey])
      .map((winner) => ({
        id: `raffle:${draw.roundKey}:${winner.prizeKey}`,
        tg_id: 'raffle',
        from_name: copy.announcement,
        text: copy.winnerMessage
          .replace('{prize}', prizeTitles[winner.prizeKey])
          .replace('{username}', winner.username),
        created_at: new Date().toISOString(),
        audience_bot: getActiveBotKey(),
      }));
    if (messages.length && flyingMessageEnabled) mergeFlyingMessages(messages);

    for (const winner of winners) {
      if (!winner.isYou || !winner.expiresAt) continue;
      const expiry = winner.expiresAt;
      if (winner.prizeKey === 'vip') {
        setVipExpiry(expiry);
        setCurrentUser((previous) => previous ? { ...previous, vip_expiry: expiry } : previous);
      } else if (winner.prizeKey === 'filter') {
        const until = Date.parse(expiry);
        if (Number.isFinite(until)) {
          setFilterSubUntil(until);
          filterSubUntilRef.current = until;
        }
      } else if (winner.prizeKey === 'invisible') {
        setInvisibleExpiry(expiry);
        setGridVisible(false);
        setMapVisible(false);
        setCurrentUser((previous) => previous
          ? { ...previous, grid_visible: false, map_visible: false, invisible_expiry: expiry }
          : previous);
      } else if (winner.prizeKey === 'hide_age') {
        setHideAge(true);
        setHideAgeExpiry(expiry);
        setCurrentUser((previous) => previous
          ? { ...previous, hide_age: true, hide_age_expiry: expiry }
          : previous);
      }
    }
  };

  const confirmRaffleTicketPurchase = (
    intentId: string,
    response: unknown,
  ): RafflePurchaseOutcome => {
    const settled = settledRaffleIntentRef.current;
    if (settled?.intentId === intentId && settled.accountId === currentUser?.id) {
      return settled.outcome;
    }
    const outcome = getRafflePurchaseOutcome('paid', intentId, response);
    if (outcome === 'pending' || outcome === 'unsupported') return 'pending';
    const pending = pendingRafflePurchaseRef.current;
    if (!pending || pending.intentId !== intentId || pending.accountId !== currentUser?.id) {
      return 'pending';
    }

    pendingRafflePurchaseRef.current = null;
    settledRaffleIntentRef.current = { intentId, accountId: pending.accountId, outcome };
    const copy = raffleUiCopy[lang];
    if (outcome === 'fulfilled') {
      setRaffleNotice(copy.ticketPurchased);
      void refreshRaffleStateRef.current?.().catch(() => {});
    } else if (outcome === 'refunded') {
      setRaffleNotice(copy.paymentRefunded);
    } else if (outcome === 'rejected') {
      setRaffleNotice(copy.paymentRejected);
    } else {
      setRaffleNotice(copy.paymentCancelled);
    }
    return outcome;
  };
  confirmRaffleTicketPurchaseRef.current = confirmRaffleTicketPurchase;

  const refreshRaffleState = async () => {
    const value = await workerPost('/api/raffle/state');
    applyRaffleState(value as RaffleState);
    return value as RaffleState;
  };
  applyRaffleStateRef.current = applyRaffleState;
  refreshRaffleStateRef.current = refreshRaffleState;

  useEffect(() => {
    if (!isReady || !raffleUserId || !flyingMessageEnabled) return;
    let active = true;
    let polling = false;
    const pollMessages = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const feed = await workerPostRef.current('/api/messages/feed');
        if (!active) return;
        if (Number.isSafeInteger(feed.starsPrice) && feed.starsPrice >= 0) {
          setFlyingMessagePrice(feed.starsPrice);
        }
        if (Array.isArray(feed.messages)) mergeFlyingMessages(feed.messages as FlyingMessage[]);
      } catch {
        // Keep the last animation state; the next poll retries automatically.
      } finally {
        polling = false;
      }
    };
    void pollMessages();
    const timer = window.setInterval(() => void pollMessages(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isReady, raffleUserId, entry.id, flyingMessageEnabled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRaffleClock(Date.now() + raffleServerOffset);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [raffleServerOffset]);

  useEffect(() => {
    if (!isReady || !raffleUserId) return;
    if (raffleAnnouncementOwnerRef.current !== raffleUserId) {
      raffleAnnouncementOwnerRef.current = raffleUserId;
      raffleAnnouncementRoundRef.current = null;
      pendingRafflePurchaseRef.current = null;
      settledRaffleIntentRef.current = null;
    }
    let active = true;
    let polling = false;
    const pollRaffle = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        try {
          const value = await workerPostRef.current('/api/raffle/state');
          if (active) applyRaffleStateRef.current?.(value as RaffleState);
        } catch {
          // The countdown has a local Hong Kong-time fallback; retry on the next interval.
        }
        const pending = pendingRafflePurchaseRef.current;
        if (active && pending) {
          if (Date.now() > pending.expiresAt) {
            pendingRafflePurchaseRef.current = null;
          } else {
            try {
              const fulfillment = await workerPostRef.current('/api/raffle/ticket/status', {
                intentId: pending.intentId,
              });
              if (active) confirmRaffleTicketPurchaseRef.current?.(pending.intentId, fulfillment);
            } catch {
              // Keep the ticket pending until this specific intent is confirmed.
            }
          }
        }
      } finally {
        polling = false;
      }
    };
    void pollRaffle();
    const timer = window.setInterval(() => void pollRaffle(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isReady, raffleUserId]);

  useEffect(() => {
    if (!isReady || !raffleUserId || !raffleState?.closesAt) return;
    const deadline = Date.parse(raffleState.closesAt);
    if (!Number.isFinite(deadline)) return;
    const delay = Math.max(0, deadline - (Date.now() + raffleServerOffset) + 1000);
    const timer = window.setTimeout(() => {
      void refreshRaffleStateRef.current?.().catch(() => {});
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isReady, raffleUserId, raffleState?.closesAt, raffleServerOffset]);

  useEffect(() => {
    if (!flyingCooldownUntil) return;
    setCooldownClock(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setCooldownClock(now);
      if (now >= flyingCooldownUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [flyingCooldownUntil]);

  useEffect(() => {
    if (!shouldAutoDismissFlyingMessageNotice(flyingMessageNoticeState)) return;
    const timer = window.setTimeout(
      () => setFlyingMessageNoticeState(getFlyingMessageNoticeAfterDismissal()),
      6000,
    );
    return () => window.clearTimeout(timer);
  }, [flyingMessageNoticeState]);

  useEffect(() => {
    if (!raffleNotice) return;
    const timer = window.setTimeout(() => setRaffleNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [raffleNotice]);

  useEffect(() => {
    if (!filterAccessNotice || isFilterAccessRenewing) return;
    const timer = window.setTimeout(() => setFilterAccessNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [filterAccessNotice, isFilterAccessRenewing]);

  useEffect(() => {
    if (!hideAgeNotice || isHideAgeRenewing) return;
    const timer = window.setTimeout(() => setHideAgeNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [hideAgeNotice, isHideAgeRenewing]);

  useEffect(() => {
    if (!invisibleNotice || isInvisibleRenewing) return;
    const timer = window.setTimeout(() => setInvisibleNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [invisibleNotice, isInvisibleRenewing]);

  const applyDefaultFiltersFromPreferences = (pRole: string, pSafety: string, pPlaystyle: string) => {
    if (pRole === 'Top') setFilterRoleVal('Bottom');
    else if (pRole === 'Bottom') setFilterRoleVal('Top');
    else if (pRole === 'Side') setFilterRoleVal('Side');
    else setFilterRoleVal(null);
    setFilterSafetyVal(pSafety);
    if (pPlaystyle === 'Party' || pPlaystyle === 'Party✓') setFilterPlaystyleVal('Party');
    else setFilterPlaystyleVal('Clean');
  };

  const fetchUsersData = async () => {
    try {
      const data = await workerPost('/api/nearby');
      if (!Array.isArray(data)) throw new Error('Nearby search returned invalid data.');
      const processed: UserProfile[] = data.map((u: any) => ({
        id: u.id || 'unknown',
        name: u.name || (u.username ? '@' + u.username : 'Anonymous'),
        username: u.username || '',
        avatar: u.avatar || '',
        lat: typeof u.lat === 'number' ? u.lat : null,
        lng: typeof u.lng === 'number' ? u.lng : null,
        last_seen: u.last_seen || null,
        gender: u.gender || null,
        seeking: u.seeking || null,
        age: typeof u.age === 'number' ? u.age : null,
        zodiac: u.zodiac || '',
        height: u.height || null,
        weight: u.weight || null,
        role_pref: u.role_pref || null,
        safety_pref: u.safety_pref || null,
        playstyle_pref: u.playstyle_pref || null,
        where_pref: u.where_pref || null,
        how_many_pref: u.how_many_pref || null,
        non_man_mode: u.non_man_mode || null,
        hide_age: u.hide_age || false,
        grid_visible: u.grid_visible ?? true,
        map_visible: u.map_visible ?? false,
        distance: typeof u.distance === 'number' ? u.distance : undefined,
        interest_received: u.interest_received === true,
        interest_cooldown_until: typeof u.interest_cooldown_until === 'string'
          ? u.interest_cooldown_until
          : null,
        interest_state_known: u.interest_state_known === true,
      })).sort((a, b) => {
        if (a.id === currentUser?.id) return -1;
        if (b.id === currentUser?.id) return 1;
        return (a.distance || 0) - (b.distance || 0);
      });
      setUsers(processed);
    } catch (error) {
      console.error('Error fetching nearby users:', error);
    }
  };
  fetchUsersDataRef.current = fetchUsersData;

  useEffect(() => {
    if (!currentUser?.id || !isReady || showProfileSetup) return;
    const refreshNearby = () => {
      if (document.visibilityState === 'visible') {
        void fetchUsersDataRef.current?.();
      }
    };
    const timer = window.setInterval(refreshNearby, 60_000);
    document.addEventListener('visibilitychange', refreshNearby);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshNearby);
    };
  }, [currentUser?.id, isReady, showProfileSetup]);

  useEffect(() => {
    const initApp = async () => {
      try {
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.ready?.();
          window.Telegram.WebApp.expand?.();
        }
        let tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        let startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
          config.defaultStartParam || '';
        if (!tgUser) {
          await new Promise((res) => setTimeout(res, 300));
          tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
          startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || startParam ||
            config.defaultStartParam || '';
        }
        const activeEntry = resolveAppEntry(config, startParam, window.location.search);
        setEntryId(activeEntry.id);
        const tgLangCode = (tgUser?.language_code || navigator.language || 'en').toLowerCase();
        if (tgLangCode.startsWith('zh')) {
          setLang(tgLangCode.includes('tw') || tgLangCode.includes('hk') || tgLangCode.includes('hant') ? 'zh-TW' : 'zh-CN');
        } else if (tgLangCode.startsWith('ja')) { setLang('ja'); }
        else if (tgLangCode.startsWith('ko')) { setLang('ko'); }
        else if (tgLangCode.startsWith('ru')) { setLang('ru'); }
        else { setLang('en'); }
        if (!window.Telegram?.WebApp?.initData) throw new Error('Open Who’s Nearby from Telegram to continue.');
        const authResponse = await workerPost('/api/auth');
        setIsTelegramPremium(authResponse.telegramPremium === true);
        if (authResponse.bot === 'botA' || authResponse.bot === 'botB') {
          verifiedBotKeyRef.current = authResponse.bot;
        }
        const existingProfile: any = authResponse.profile;
        if (!existingProfile?.id) throw new Error('Your profile could not be loaded.');
        const userUsername = existingProfile.username || tgUser?.username || '';
        // Fetch the managed role list only when an admin opens its manager.
        setRoles([]);
        // The Worker reads this server-side so no Supabase credential is sent to the browser.
        const globalVipUntil = Number(authResponse.globalVipUntil);
        if (Number.isFinite(globalVipUntil)) setGlobalVipUntil(globalVipUntil);
        const pendingVipGrant = authResponse.vipGrantNotice;
        const pendingClaimIds = Array.isArray(pendingVipGrant?.claimIds)
          ? pendingVipGrant.claimIds
              .filter((id: unknown): id is string => typeof id === 'string')
              .slice(0, 50)
          : [];
        if (pendingVipGrant && Array.isArray(pendingVipGrant.claimIds) &&
            pendingClaimIds.length > 0 &&
            Number.isSafeInteger(Number(pendingVipGrant.days)) && Number(pendingVipGrant.days) > 0) {
          setVipGrantNotice({
            claimIds: pendingClaimIds,
            days: Number(pendingVipGrant.days),
            vipUntil: typeof pendingVipGrant.vipUntil === 'string' ? pendingVipGrant.vipUntil : null,
          });
          setVipGrantAcknowledgementError('');
        }
        setIsAdmin(authResponse.role === 'admin');
        setIsVip(authResponse.role === 'vip');
        const userId = existingProfile.id;
        const userName = existingProfile.name || tgUser?.first_name || 'Anonymous';
        const userAvatar = existingProfile.avatar || '';
        if (existingProfile.is_underage) { setIsUnderageLocked(true); setIsReady(true); return; }
        const fix = await requestLocationAccess(navigator.geolocation);
        if (!fix) {
          setIsLocationDenied(true);
          return;
        }
        try {
          const locationSaveResult = await workerPost('/api/profile', {
            profile: { lat: fix.lat, lng: fix.lng },
          });
          if (!isLocationSaveConfirmed(locationSaveResult, fix)) {
            setIsLocationDenied(true);
            return;
          }
        } catch {
          setIsLocationDenied(true);
          return;
        }
        setLocation(fix);
        localStorage.setItem('whos_nearby_user_id', userId);
        const {
          gender: initialGender,
          seeking: initialSeeking,
        } = resolveInitialProfileIdentity(existingProfile, activeEntry);
        setGender(initialGender); setSeeking(initialSeeking);
        setProfileCompletionMissingFields({
          dob: !existingProfile?.dob,
          gender: !existingProfile?.gender,
          height: !existingProfile?.height,
          weight: !existingProfile?.weight,
        });
        const isManSeekingMan = initialGender === 'man' && initialSeeking === 'men';
        const isFullySetup = Boolean(
          existingProfile && existingProfile.dob && existingProfile.gender &&
          existingProfile.seeking && existingProfile.height && existingProfile.weight &&
          (!isManSeekingMan || (existingProfile.role_pref && existingProfile.safety_pref && existingProfile.playstyle_pref && existingProfile.how_many_pref && existingProfile.where_pref !== undefined)) &&
          (isManSeekingMan || existingProfile.non_man_mode)
        );
        const invisibilityPassExpired = isInvisibilityExpired(
          existingProfile?.grid_visible,
          existingProfile?.invisible_expiry,
        );
        const profileVipUntil = existingProfile?.vip_expiry
          ? Date.parse(existingProfile.vip_expiry)
          : 0;
        const initialPaidUnlocked = authResponse.role === 'admin' ||
          authResponse.role === 'vip' ||
          (Number.isFinite(profileVipUntil) && profileVipUntil > Date.now()) ||
          globalVipUntil > Date.now();
        if (invisibilityPassExpired && !initialPaidUnlocked) {
          setInvisibleNotice('ended');
        }
        let initialGridVisible = true;
        if (existingProfile) {
          setVipExpiry(existingProfile.vip_expiry || null);
          if (existingProfile.dob) setDob(existingProfile.dob);
          if (existingProfile.height) setHeight(existingProfile.height);
          if (existingProfile.weight) setWeight(existingProfile.weight);
          if (existingProfile.role_pref) setRolePref(existingProfile.role_pref);
          if (existingProfile.safety_pref) setSafetyPref(existingProfile.safety_pref);
          if (existingProfile.playstyle_pref) setPlaystylePref(existingProfile.playstyle_pref);
          if (existingProfile.how_many_pref) setHowManyPref(existingProfile.how_many_pref);
          if (existingProfile.where_pref !== undefined && existingProfile.where_pref !== null) setWherePref(existingProfile.where_pref);
          if (existingProfile.non_man_mode) setNonManMode(existingProfile.non_man_mode);
          if (typeof existingProfile.hide_age === 'boolean') setHideAge(existingProfile.hide_age);
          if (existingProfile.hide_age_expiry) setHideAgeExpiry(existingProfile.hide_age_expiry);
          if (existingProfile.invisible_expiry) setInvisibleExpiry(invisibilityPassExpired ? null : existingProfile.invisible_expiry);
          if (existingProfile.filter_sub_expiry) {
            const ts = new Date(existingProfile.filter_sub_expiry).getTime();
            if (Number.isFinite(ts) && ts > Date.now()) {
              setFilterSubUntil(ts);
              filterSubUntilRef.current = ts;
            }
          }
          if (typeof existingProfile.grid_visible === 'boolean') {
            initialGridVisible = resolveGridVisibility(existingProfile.grid_visible, existingProfile.invisible_expiry);
            setGridVisible(initialGridVisible);
          }
          if (typeof existingProfile.map_visible === 'boolean') setMapVisible(existingProfile.map_visible);
          if (isManSeekingMan) {
            applyDefaultFiltersFromPreferences(
              existingProfile.role_pref || 'Versatile', existingProfile.safety_pref || 'Safe',
              existingProfile.playstyle_pref || 'Clean'
            );
          }
        }
        const currentLoc = fix;
        if (!isFullySetup) {
          setShowProfileSetup(true);
          setCurrentUser({ id: userId, name: userName, username: userUsername, avatar: userAvatar, lat: null, lng: null, last_seen: null, gender: initialGender, seeking: initialSeeking, dob: null, height: null, weight: null, role_pref: null, safety_pref: null, playstyle_pref: null, where_pref: null, how_many_pref: null, non_man_mode: null, is_underage: false, hide_age: false, grid_visible: true, map_visible: false, hide_age_expiry: null, invisible_expiry: null, vip_expiry: existingProfile?.vip_expiry || null });
        } else {
          const myProfile: UserProfile = { id: userId, name: userName, username: userUsername, avatar: userAvatar, lat: currentLoc.lat, lng: currentLoc.lng, last_seen: new Date().toISOString(), gender: initialGender, seeking: initialSeeking, dob: existingProfile.dob, height: existingProfile.height, weight: existingProfile.weight, role_pref: isManSeekingMan ? existingProfile.role_pref : null, safety_pref: isManSeekingMan ? existingProfile.safety_pref : null, playstyle_pref: isManSeekingMan ? existingProfile.playstyle_pref : null, where_pref: isManSeekingMan ? existingProfile.where_pref : null, how_many_pref: isManSeekingMan ? existingProfile.how_many_pref : null, non_man_mode: isManSeekingMan ? null : existingProfile.non_man_mode, is_underage: false, hide_age: existingProfile.hide_age || false, grid_visible: initialGridVisible, map_visible: existingProfile.map_visible ?? false, hide_age_expiry: existingProfile.hide_age_expiry || null, invisible_expiry: invisibilityPassExpired ? null : existingProfile.invisible_expiry || null, vip_expiry: existingProfile.vip_expiry || null };
          setCurrentUser(myProfile);
          // The existing profile is enough to show the app. Nearby results
          // and the saved location refresh can finish after the first render.
          void fetchUsersData();
           // Improve the location after the first screen is ready without delaying startup.
           navigator.geolocation.getCurrentPosition(
             (position) => {
               const preciseLocation = {
                 lat: position.coords.latitude,
                 lng: position.coords.longitude,
               };
               void workerPost('/api/profile', { profile: preciseLocation })
                 .then(() => {
                   setLocation(preciseLocation);
                   setCurrentUser((previous) => previous && previous.id === userId
                     ? { ...previous, ...preciseLocation }
                     : previous);
                   return fetchUsersData();
                 })
                 .catch((error) => console.warn('Could not update precise location:', error));
             },
             () => {},
             { enableHighAccuracy: true, timeout: 12000, maximumAge: 600000 }
           );
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setStartupError(err instanceof Error ? err.message : 'Could not load your profile.');
      }
      finally { setIsReady(true); }
    };
    initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; deps are intentionally frozen at init
  }, []);

  const handleRefresh = async () => {
    if (!currentUser) return;
    const lastRefreshKey = `last_refresh_${currentUser.id}`;
    const lastRefreshTime = Number(localStorage.getItem(lastRefreshKey) || 0);
    const now = Date.now();
    if (now - lastRefreshTime < 5 * 60 * 1000) return;
    localStorage.setItem(lastRefreshKey, now.toString());
    await fetchUsersData();
  };

  const handleToggleFilterDropdown = () => setShowFilterDropdown(!showFilterDropdown);

  const handleToggleFilterItem = async (key: 'hideNonMatching' | 'age' | 'height' | 'prefMatcher') => {
    if (!hasFilterOptionAccess(key, {
      filterAccessActive,
      telegramPremium: isTelegramPremium,
    })) {
      const ok = await verifyFilterSubscription('filter_option');
      if (!ok) return;
    }
    if (key === 'hideNonMatching') {
      const next = !hideNonMatchingUsers;
      setHideNonMatchingUsers(next);
      persistFilterPrefs({ hideNonMatching: next });
      return;
    }
    if (key === 'prefMatcher') {
      const next = !filterPrefMatcherOn;
      setFilterPrefMatcherOn(next);
      persistFilterPrefs({ prefMatcherOn: next });
      return;
    }
    if (key === 'age') { const next = !filterAgeOn; setFilterAgeOn(next); persistFilterPrefs({ ageOn: next }); }
    else if (key === 'height') { const next = !filterHeightOn; setFilterHeightOn(next); persistFilterPrefs({ heightOn: next }); }
  };

  const handleToggleFilterValue = async (key: 'role' | 'safety' | 'playstyle' | 'howMany' | 'where') => {
    if (!filterAccessActive) {
      const ok = await verifyFilterSubscription('filter_option');
      if (!ok) return;
    }
    const cycles: Record<string, readonly string[]> = { role: filterRoleCycleOptions, safety: filterSafetyCycleOptions, playstyle: filterPlaystyleCycleOptions, where: filterWhereCycleOptions };
    const getVal = () => { if (key === 'role') return filterRoleVal; if (key === 'safety') return filterSafetyVal; if (key === 'playstyle') return filterPlaystyleVal; if (key === 'howMany') return filterHowManyVal; return filterWhereVal; };
    const setVal = (v: string | null) => {
      if (key === 'role') setFilterRoleVal(v); else if (key === 'safety') setFilterSafetyVal(v);
      else if (key === 'playstyle') setFilterPlaystyleVal(v); else if (key === 'howMany') setFilterHowManyVal(normalizeHowManyFilterValue(v));
      else setFilterWhereVal(v);
      persistFilterPrefs({ roleVal: key === 'role' ? v : undefined, safetyVal: key === 'safety' ? v : undefined, playstyleVal: key === 'playstyle' ? v : undefined, howManyVal: key === 'howMany' ? v : undefined, whereVal: key === 'where' ? v : undefined } as any);
    };
    const current = getVal();
    if (key === 'howMany') {
      setVal(nextHowManyFilterValue(current));
      return;
    }
    setVal(nextFilterCycleValue(current, cycles[key]));
  };

  const handleToggleFilterGender = async (genderValue: GenderFilterValue) => {
    if (hkmoMenOnlyFilterLocked) return;
    if (!filterAccessActive) {
      const ok = await verifyFilterSubscription('filter_option');
      if (!ok) return;
    }
    const next = filterGenderVals.includes(genderValue)
      ? filterGenderVals.filter((value) => value !== genderValue)
      : [...filterGenderVals, genderValue];
    setFilterGenderVals(next);
    persistFilterPrefs({ genderVals: next });
  };

  const handleAgeRangeChange = (min: number, max: number) => { setFilterAgeMin(min); setFilterAgeMax(max); persistFilterPrefs({ ageMin: min, ageMax: max }); };
  const handleHeightRangeChange = (min: number, max: number) => { setFilterHeightMin(min); setFilterHeightMax(max); persistFilterPrefs({ heightMin: min, heightMax: max }); };

  const handleSaveInitialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const isCompletionFlow = showProfileSetup && !showProfileEditModal;
    const isManSeekingMan = gender === 'man' && seeking === 'men';
    if (!dob || !gender || !seeking || !height || !weight || (isManSeekingMan && (!rolePref || !safetyPref || !playstylePref || !howManyPref || wherePref === undefined)) || (!isManSeekingMan && !nonManMode)) { setErrorMessage(t('fillAll')); return; }
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) {
      if (!currentUser) return;
      try {
        await workerPost('/api/profile', { profile: { dob } });
        setIsUnderageLocked(true);
      } catch (error) {
        setErrorMessage(`${t('errorSaving')} ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (!currentUser) return;
    try {
      const profileUpdate: Record<string, unknown> = {
        lat: location.lat,
        lng: location.lng,
        seeking,
        role_pref: isManSeekingMan ? rolePref : null,
        safety_pref: isManSeekingMan ? safetyPref : null,
        playstyle_pref: isManSeekingMan ? playstylePref : null,
        how_many_pref: isManSeekingMan ? howManyPref : null,
        where_pref: isManSeekingMan ? wherePref : null,
        non_man_mode: isManSeekingMan ? null : nonManMode,
      };
      if (!isCompletionFlow || profileCompletionMissingFields.dob) profileUpdate.dob = dob;
      if (!isCompletionFlow || profileCompletionMissingFields.gender) profileUpdate.gender = gender;
      if (!isCompletionFlow || profileCompletionMissingFields.height) profileUpdate.height = height;
      if (!isCompletionFlow || profileCompletionMissingFields.weight) profileUpdate.weight = weight;
      const result = await workerPost('/api/profile', {
        profile: profileUpdate,
      });
      applyOwnProfile(result.profile);
    if (isManSeekingMan) applyDefaultFiltersFromPreferences(rolePref, safetyPref, playstylePref);
      setShowProfileSetup(false);
      setShowProfileEditModal(false);
      loadFilterPrefs();
      await fetchUsersData();
    } catch (error) {
      setErrorMessage(`${t('errorSaving')} ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Open a Telegram invoice with a graceful fallback if openInvoice is
  // unavailable (desktop bug, older client). Unknown statuses stay unresolved.
  const startInvoice = (invoiceLink: string): Promise<string> => {
    return new Promise((resolve) => {
      const w = window.Telegram?.WebApp;
      if (w?.openInvoice) {
        w.openInvoice(invoiceLink, (status: string) => {
          resolve(['paid', 'cancelled', 'failed'].includes(status) ? status : 'unsupported');
        });
      } else if (typeof invoiceLink === 'string' && invoiceLink.startsWith('https://t.me/')) {
        try {
          if (w?.openTelegramLink) w.openTelegramLink(invoiceLink);
          else window.open(invoiceLink, '_blank', 'noopener,noreferrer');
        } catch {
          window.open(invoiceLink, '_blank', 'noopener,noreferrer');
        }
        resolve('unsupported'); // client UI can't observe the result; do NOT auto-apply perks
      } else {
        resolve('failed');
      }
    });
  };

  const startPurchase = async (type: string) => {
    if (hasPendingPaymentVerification()) {
      throw new Error(t('paymentProcessing'));
    }
    const result = await workerPost('/create-invoice', { userId: currentUser?.id, type });
    if (!result.invoiceLink) throw new Error('The payment service did not return an invoice link.');
    const invoiceStatus = await startInvoice(result.invoiceLink as string);
    if ((type === 'hide_age' || type === 'invisible') &&
        typeof result.purchaseId === 'string' &&
        (invoiceStatus === 'cancelled' || invoiceStatus === 'failed')) {
      try {
        await workerPost('/api/pass-purchase/resolve', {
          purchaseId: result.purchaseId,
          type,
          status: invoiceStatus,
        });
      } catch (error) {
        console.warn('[payment] pass invoice resolution will be retried through the existing invoice', error);
      }
    }
    return invoiceStatus;
  };

  const handleBuyRaffleTicket = async () => {
    if (!starRaffleEnabled || rafflePurchasing) return;
    const copy = raffleUiCopy[lang];
    if (!currentUser?.username) {
      setRaffleNotice(copy.usernameRequired);
      return;
    }
    if (raffleState && !raffleState.canPurchase) {
      setRaffleNotice(raffleState.usernameRequired ? copy.usernameRequired : copy.adultProfileRequired);
      return;
    }

    setRaffleNotice('');
    setRafflePurchasing(true);
    let intentId: string | null = null;
    try {
      const result = await workerPost('/api/raffle/ticket');
      if (typeof result.invoiceLink !== 'string' || typeof result.intentId !== 'string') {
        throw new Error('The payment service did not return a raffle invoice.');
      }
      const raffleIntentId = result.intentId;
      intentId = raffleIntentId;
      pendingRafflePurchaseRef.current = {
        intentId: raffleIntentId,
        accountId: currentUser.id,
        expiresAt: Date.now() + 15 * 60_000,
      };
      setRaffleNotice(copy.processing);
      const invoiceStatus = await startInvoice(result.invoiceLink);
      if (invoiceStatus === 'paid') {
        let terminalOutcome: RafflePurchaseTerminalOutcome | null = null;
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            const fulfillment = await workerPost('/api/raffle/ticket/status', {
              intentId: raffleIntentId,
            });
            const outcome = confirmRaffleTicketPurchaseRef.current?.(raffleIntentId, fulfillment)
              ?? 'pending';
            if (outcome !== 'pending' && outcome !== 'unsupported') {
              terminalOutcome = outcome;
              break;
            }
          } catch {
            // Payment webhooks can arrive after Telegram closes the invoice.
          }
          if (attempt < 11) await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        const settled = settledRaffleIntentRef.current;
        terminalOutcome = terminalOutcome ?? (
          settled &&
          settled.intentId === raffleIntentId &&
          settled.accountId === currentUser.id
            ? settled.outcome
            : null
        );
        if (!terminalOutcome) setRaffleNotice(copy.paymentProcessing);
      } else if (invoiceStatus === 'unsupported') {
        // Keep checking this intent; the aggregate ticket count is not proof
        // that this specific purchase was fulfilled.
        setRaffleNotice(copy.invoiceFallback);
      } else {
        if (pendingRafflePurchaseRef.current?.intentId === raffleIntentId) {
          pendingRafflePurchaseRef.current = null;
        }
        try { await workerPost('/api/raffle/cancel', { intentId: raffleIntentId }); } catch {}
        setRaffleNotice(copy.paymentCancelled);
      }
    } catch (error) {
      if (intentId && pendingRafflePurchaseRef.current?.intentId === intentId) {
        pendingRafflePurchaseRef.current = null;
      }
      if (intentId) {
        try { await workerPost('/api/raffle/cancel', { intentId }); } catch {}
      }
      setRaffleNotice(error instanceof Error ? error.message : 'Could not start raffle ticket purchase.');
    } finally {
      setRafflePurchasing(false);
    }
  };

  const handleSendFlyingMessage = async () => {
    const text = flyingMessageText.trim();
    if (!flyingMessageEnabled || !text || sendingFlyingMessage) return;
    dismissFlyingMessageNotice();
    setSendingFlyingMessage(true);
    try {
      const result = await workerPost('/api/messages', { text });
      if (result.message) {
        mergeFlyingMessages([result.message as FlyingMessage]);
        setFlyingMessageText('');
        setFlyingCooldownUntil(Date.now() + 60_000);
        return;
      }

      if (result.ok === true) {
        throw new Error('The message service returned an incomplete response. Please try again later.');
      }
      if (!result.invoiceLink || !result.intentId) {
        throw new Error('The payment service returned an incomplete invoice response. Please try again later.');
      }
      const invoiceStatus = await startInvoice(result.invoiceLink as string);
      if (invoiceStatus === 'paid') {
        let paidMessage: FlyingMessage | null = null;
        let terminalOutcome: FlyingMessageTerminalOutcome | null = null;
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            const fulfillment = await workerPost('/api/messages/status', { intentId: result.intentId });
            const resolution = getFlyingMessagePurchaseResolution(
              invoiceStatus,
              result.intentId,
              fulfillment,
              currentUser?.id,
              entry.botKey,
            );
            if (
              resolution.outcome === 'refunded' ||
              resolution.outcome === 'rejected' ||
              resolution.outcome === 'cancelled'
            ) {
              terminalOutcome = resolution.outcome;
              break;
            }
            if (resolution.message) {
              paidMessage = resolution.message;
              break;
            }
          } catch {
            // The webhook may still be processing; keep checking briefly.
          }
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        if (paidMessage) {
          mergeFlyingMessages([paidMessage]);
          setFlyingMessageText((current) =>
            getFlyingMessageDraftAfterOutcome(current, text, 'fulfilled'),
          );
          setFlyingCooldownUntil(Date.now() + 60_000);
          dismissFlyingMessageNotice();
        } else if (terminalOutcome === 'refunded') {
          setFlyingMessageText((current) =>
            getFlyingMessageDraftAfterOutcome(current, text, terminalOutcome),
          );
          showFlyingMessageNotice(
            flyingMessageCopy[lang].paymentRefunded,
            shouldPersistFlyingMessageOutcome(terminalOutcome),
          );
        } else if (terminalOutcome === 'rejected') {
          setFlyingMessageText((current) =>
            getFlyingMessageDraftAfterOutcome(current, text, terminalOutcome),
          );
          showFlyingMessageNotice(
            flyingMessageCopy[lang].paymentRejected,
            shouldPersistFlyingMessageOutcome(terminalOutcome),
          );
        } else if (terminalOutcome === 'cancelled') {
          setFlyingMessageText((current) =>
            getFlyingMessageDraftAfterOutcome(current, text, terminalOutcome),
          );
          showFlyingMessageNotice(t('paymentCancelled'));
        } else {
          showFlyingMessageNotice(flyingMessageCopy[lang].paymentProcessing);
        }
      } else if (invoiceStatus === 'unsupported') {
        showFlyingMessageNotice(flyingMessageCopy[lang].invoiceFallback);
      } else {
        try { await workerPost('/api/messages/cancel', { intentId: result.intentId }); } catch {}
        setFlyingMessageText(text);
        showFlyingMessageNotice(t('paymentCancelled'));
      }
    } catch (error) {
      const apiError = error as Error & { retryAfter?: number };
      if (apiError.retryAfter) setFlyingCooldownUntil(Date.now() + apiError.retryAfter * 1000);
      showFlyingMessageNotice(apiError.message || 'Message could not be sent.');
    } finally {
      setSendingFlyingMessage(false);
    }
  };

  const verifyFilterSubscription = async (
    location: FilterRenewalLocation,
    allowActiveRenewal = false,
  ): Promise<boolean> => {
    if (hasPendingPaymentVerification()) {
      alert(t('paymentProcessing'));
      return false;
    }
    if (allowActiveRenewal && !filterSubscriptionActive) return false;
    if (filterAccessActive && !allowActiveRenewal) return true;
    if (filterAccessPurchaseInProgressRef.current) return false;
    const confirmed = window.confirm(
      allowActiveRenewal ? FILTER_EARLY_RENEWAL_PROMPT_COPY[lang] : t('filterSubPrompt'),
    );
    if (!confirmed) return false;
    filterAccessPurchaseInProgressRef.current = true;
    setIsFilterAccessRenewing(true);
    const purchaseAccountId = currentUser?.id ?? null;
    try {
      const minimumExpiry = getMinimumFilterSubscriptionExpiry(raffleClock, filterSubUntilRef.current);
      const status = await startPurchase('change_filter');
      let profile: UserProfile | null = null;
      let marker: PendingAccessRecheck | null = null;
      if (status === 'paid') {
        if (purchaseAccountId) {
          marker = await persistPendingAccessRecheck({
            accountId: purchaseAccountId,
            entitlement: 'filter',
            minimumExpiry,
            location,
            allowActiveRenewal,
          });
        }
        profile = await waitForPaidProfile((value) =>
          isPaidEntitlementConfirmed(status, value, 'filter', minimumExpiry),
          true,
          marker,
        );
      }
      const outcome = getPaidEntitlementOutcome(status, profile, 'filter', minimumExpiry);
      if (outcome === 'confirmed') {
        void reportFilterRenewalConfirmed(status, marker, profile);
        clearPendingAccessRecheck(marker);
        return true;
      }
      if (outcome === 'pending') {
        trackEvent('filter_renewal_pending', { location });
        alert(t('paymentProcessing'));
      } else if (outcome === 'unsupported') {
        trackEvent('filter_renewal_pending', { location });
      } else if (outcome === 'cancelled') {
        trackEvent('filter_renewal_cancelled', { location });
        alert(t('paymentCancelled'));
      }
    } catch (err) {
      console.error('Invoice error:', err);
      alert(t('paymentCancelled'));
    } finally {
      filterAccessPurchaseInProgressRef.current = false;
      setIsFilterAccessRenewing(false);
    }
    return false;
  };

  const handleRenewFilterAccess = async (
    location: FilterRenewalLocation,
    allowActiveRenewal = false,
  ) => {
    trackEvent('filter_renewal_cta_clicked', { location });
    if (filterAccessPurchaseInProgressRef.current) return;
    if (allowActiveRenewal && !filterSubscriptionActive) return;
    if (hasPendingPaymentVerification()) {
      alert(t('paymentProcessing'));
      return;
    }
    if (filterAccessActive && !allowActiveRenewal) return;
    await verifyFilterSubscription(location, allowActiveRenewal);
  };

  const FILTER_SUB_KEY = 'whos_nearby_filter_sub_until';

  const resetFilterPreferences = (removeSaved = true) => {
    setHideNonMatchingUsers(DEFAULT_FILTER_PREFERENCES.hideNonMatching);
    setFilterAgeOn(DEFAULT_FILTER_PREFERENCES.ageOn);
    setFilterAgeMin(DEFAULT_FILTER_PREFERENCES.ageMin);
    setFilterAgeMax(DEFAULT_FILTER_PREFERENCES.ageMax);
    setFilterHeightOn(DEFAULT_FILTER_PREFERENCES.heightOn);
    setFilterHeightMin(DEFAULT_FILTER_PREFERENCES.heightMin);
    setFilterHeightMax(DEFAULT_FILTER_PREFERENCES.heightMax);
    setFilterGenderVals([...DEFAULT_FILTER_PREFERENCES.genderVals]);
    setFilterPrefMatcherOn(DEFAULT_FILTER_PREFERENCES.prefMatcherOn);
    setFilterRoleVal(DEFAULT_FILTER_PREFERENCES.roleVal);
    setFilterSafetyVal(DEFAULT_FILTER_PREFERENCES.safetyVal);
    setFilterPlaystyleVal(DEFAULT_FILTER_PREFERENCES.playstyleVal);
    setFilterHowManyVal(DEFAULT_FILTER_PREFERENCES.howManyVal);
    setFilterWhereVal(DEFAULT_FILTER_PREFERENCES.whereVal);
    if (removeSaved) {
      try { removeFilterPreferences(localStorage, currentUser?.id); } catch {}
    }
  };

  const applyOwnProfile = (profile: any) => {
    if (!profile) return;
    setCurrentUser((previous) => previous ? { ...previous, ...profile } : profile);
    if ('vip_expiry' in profile) setVipExpiry(profile.vip_expiry || null);
    setHideAge(profile.hide_age === true);
    setHideAgeExpiry(profile.hide_age_expiry || null);
    setInvisibleExpiry(profile.invisible_expiry || null);
    setGridVisible(profile.grid_visible ?? true);
    setMapVisible(profile.map_visible ?? false);
    const subscriptionExpiry = profile.filter_sub_expiry
      ? new Date(profile.filter_sub_expiry).getTime()
      : 0;
    const validExpiry = Number.isFinite(subscriptionExpiry) && subscriptionExpiry > Date.now()
      ? subscriptionExpiry
      : 0;
    setFilterSubUntil(validExpiry);
    filterSubUntilRef.current = validExpiry;
    try {
      if (validExpiry) localStorage.setItem(FILTER_SUB_KEY, String(validExpiry));
      else localStorage.removeItem(FILTER_SUB_KEY);
    } catch {}
  };
  applyOwnProfileRef.current = applyOwnProfile;

  const confirmPendingAccess = (marker: PendingAccessRecheck, profile: UserProfile) => {
    if (!isPendingAccessConfirmed(marker, profile)) return false;
    applyOwnProfileRef.current(profile);
    if (marker.entitlement === 'filter') {
      void reportFilterRenewalConfirmed(marker.paymentStatus, marker, profile);
    } else if (marker.entitlement === 'invisible') {
      setInvisibleNotice('active');
      setView('grid');
      void fetchUsersData();
    } else if (marker.entitlement === 'hideAge') {
      setHideAgeNotice('active');
    } else if (marker.entitlement === 'editProfile') {
      setShowProfileEditModal(true);
    }
    clearPendingAccessRecheck(marker);
    return true;
  };
  confirmPendingAccessRef.current = confirmPendingAccess;

  const waitForPaidProfile = async (
    isGranted: (profile: any) => boolean,
    applyUnconfirmedProfile = true,
    initialMarker: PendingAccessRecheck | null = null,
  ) => {
    let latestProfile: any = null;
    let marker = initialMarker;
    paidProfileVerificationInProgressRef.current = true;
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        let retryDelayMs = 500;
        if (marker) {
          if (!shouldContinueAccessRechecks(marker.attempts, marker.startedAt, Date.now())) break;
          const updatedMarker = { ...marker, attempts: marker.attempts + 1 };
          marker = updatedMarker;
          try { savePendingAccessRecheck(localStorage, updatedMarker); } catch {}
        }
        try {
          const result = marker
            ? await checkPendingAccessProfile(
              marker,
              async () => (await workerPost('/api/profile/check')).profile,
            )
            : {
              status: 'pending' as const,
              profile: (await workerPost('/api/profile/check')).profile,
              error: null,
            };
          if (result.status === 'unavailable') throw result.error;
          latestProfile = result.profile;
          const profileMatchesAccount = !marker || String(latestProfile?.id) === marker.accountId;
          const entitlementConfirmed = latestProfile && profileMatchesAccount &&
            (marker ? result.status === 'confirmed' : isGranted(latestProfile));
          if (latestProfile && profileMatchesAccount && (applyUnconfirmedProfile || isGranted(latestProfile))) {
            applyOwnProfile(latestProfile);
          }
          if (entitlementConfirmed) return latestProfile;
        } catch (error) {
          console.warn('Paid access is awaiting Worker profile confirmation.', error);
          retryDelayMs = getAccessRecheckRetryDelayMs(error);
        }
        if (attempt < 5) {
          await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
        }
      }
      return latestProfile;
    } finally {
      paidProfileVerificationInProgressRef.current = false;
      if (marker) {
        try { savePendingAccessRecheck(localStorage, marker); } catch {}
        if (pendingAccessRecheckRef.current?.accountId === marker.accountId &&
            pendingAccessRecheckRef.current?.startedAt === marker.startedAt) {
          pendingAccessRecheckRef.current = marker;
        }
        setPendingAccessRecheck((current) =>
          current?.accountId === marker?.accountId && current?.startedAt === marker?.startedAt
            ? marker
            : current,
        );
      }
    }
  };

  useEffect(() => {
    if (!isReady || !currentUserId) {
      setPendingAccessRecoveryAccountId(null);
      return;
    }
    const accountId = currentUserId;
    setPendingAccessRecoveryAccountId(null);
    let cancelled = false;
    const syncPendingAccessRecheck = () => {
      let pending: PendingAccessRecheck | null = null;
      try { pending = loadPendingAccessRecheck(localStorage, accountId, Date.now()); } catch {}
      pendingAccessRecheckRef.current = pending;
      setPendingAccessRecheck(pending);
    };
    syncPendingAccessRecheck();
    const recoverPendingAccessRecheck = async () => {
      try {
        const response = await workerPostRef.current('/api/access-recovery/recover');
        if (cancelled || currentUserRef.current?.id !== accountId) return;
        if (!response || !Object.prototype.hasOwnProperty.call(response, 'pending')) {
          throw new Error('Invalid pending access recovery response.');
        }

        let recoveredMarker: PendingAccessRecheck | null = null;
        if (response.pending !== null) {
          const remote = response.pending;
          if (!remote || typeof remote !== 'object' || Array.isArray(remote)) {
            throw new Error('Invalid pending access recovery record.');
          }
          recoveredMarker = createPendingAccessRecheck({
            accountId,
            entitlement: remote.entitlement as PendingAccessRecheck['entitlement'],
            startedAt: Number(remote.startedAt),
            createdAt: Number(remote.createdAt),
            minimumExpiry: Number(remote.minimumExpiry),
            ...(remote.entitlement === 'filter'
              ? {
                location: remote.location as PendingAccessRecheck['location'],
                allowActiveRenewal: remote.allowActiveRenewal,
              }
              : {}),
          });
          if (!recoveredMarker) throw new Error('Invalid pending access recovery record.');
        }

        let localMarker: PendingAccessRecheck | null = null;
        try { localMarker = loadPendingAccessRecheck(localStorage, accountId, Date.now()); } catch {}
        const selectedMarker = selectMostRecentPendingAccessRecheck(
          localMarker,
          recoveredMarker,
          accountId,
        );
        if (!selectedMarker) {
          pendingAccessRecheckRef.current = null;
          setPendingAccessRecheck(null);
          return;
        }

        try { savePendingAccessRecheck(localStorage, selectedMarker); } catch {}
        pendingAccessRecheckRef.current = selectedMarker;
        setPendingAccessRecheck(selectedMarker);
        if (selectedMarker === localMarker &&
            (!recoveredMarker || localMarker?.startedAt > recoveredMarker.startedAt)) {
          void queuePendingAccessRecoverySave(selectedMarker);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not restore pending payment status from the Worker.', error);
        }
      } finally {
        if (!cancelled && currentUserRef.current?.id === accountId) {
          setPendingAccessRecoveryAccountId(accountId);
        }
      }
    };
    void recoverPendingAccessRecheck();
    const handlePendingAccessStorage = (event: StorageEvent) => {
      if (event.key === PENDING_ACCESS_RECHECK_STORAGE_KEY) syncPendingAccessRecheck();
    };
    window.addEventListener('storage', handlePendingAccessStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', handlePendingAccessStorage);
    };
  }, [isReady, currentUserId]);

  useEffect(() => {
    const pending = pendingAccessRecheck;
    if (!pending || !isReady) return;
    if (paidProfileVerificationInProgressRef.current) return;
    const activeUser = currentUserRef.current;
    if (!activeUser || currentUserId !== pending.accountId) return;
    const confirmed = isPendingAccessConfirmed(pending, activeUser);
    const complete = (profile: UserProfile) => confirmPendingAccessRef.current(pending, profile);
    if (confirmed) {
      complete(activeUser);
      return;
    }
    if (pending.entitlement === 'filter' && filterAccessActive && !pending.allowActiveRenewal) {
      clearPendingAccessRecheck(pending);
      return;
    }

    const markerKey = `${pending.accountId}:${pending.entitlement}:${pending.startedAt}`;
    if (accessRecheckAttemptsRef.current.key !== markerKey) {
      accessRecheckAttemptsRef.current = { key: markerKey, attempts: pending.attempts };
    } else {
      accessRecheckAttemptsRef.current.attempts = Math.max(
        accessRecheckAttemptsRef.current.attempts,
        pending.attempts,
      );
    }
    let timeoutId: number | null = null;
    let stopped = false;
    const stop = (clearMarker = false) => {
      if (stopped) return;
      stopped = true;
      if (clearMarker) clearPendingAccessRecheck(pending);
    };
    const pauseForManualRetry = () => {
      if (stopped) return;
      const attempts = Math.max(
        pending.attempts,
        accessRecheckAttemptsRef.current.attempts,
      );
      if (attempts !== pending.attempts) {
        const retainedMarker = { ...pending, attempts };
        try { savePendingAccessRecheck(localStorage, retainedMarker); } catch {}
        pendingAccessRecheckRef.current = retainedMarker;
        setPendingAccessRecheck((current) =>
          current?.accountId === pending.accountId && current?.startedAt === pending.startedAt
            ? retainedMarker
            : current,
        );
      }
      stopped = true;
    };
    const scheduleNext = () => {
      if (stopped) return;
      if (!shouldContinueAccessRechecks(accessRecheckAttemptsRef.current.attempts, pending.startedAt, Date.now())) {
        pauseForManualRetry();
        return;
      }
      timeoutId = window.setTimeout(() => { void recheck(); }, ACCESS_RECHECK_INTERVAL_MS);
    };
    const recheck = async () => {
      if (stopped) return;
      if (currentUserId !== pending.accountId) {
        stop(true);
        return;
      }
      let latestMarker: PendingAccessRecheck | null = null;
      try { latestMarker = loadPendingAccessRecheck(localStorage, pending.accountId, Date.now()); } catch {}
      if (latestMarker && latestMarker.startedAt !== pending.startedAt) {
        stop();
        return;
      }
      if (latestMarker?.startedAt === pending.startedAt) {
        accessRecheckAttemptsRef.current.attempts = Math.max(
          accessRecheckAttemptsRef.current.attempts,
          latestMarker.attempts,
        );
      }
      if (!shouldContinueAccessRechecks(accessRecheckAttemptsRef.current.attempts, pending.startedAt, Date.now())) {
        pauseForManualRetry();
        return;
      }
      const nextMarker = { ...pending, attempts: accessRecheckAttemptsRef.current.attempts + 1 };
      accessRecheckAttemptsRef.current.attempts = nextMarker.attempts;
      try { savePendingAccessRecheck(localStorage, nextMarker); } catch {}
      try {
        const response = await workerPostRef.current('/api/profile/check');
        if (stopped) return;
        if (currentUserId !== pending.accountId) {
          stop(true);
          return;
        }
        const profile = response?.profile as UserProfile | undefined;
        if (profile && String(profile.id) === pending.accountId) {
          if (isPendingAccessConfirmed(pending, profile)) {
            complete(profile);
            stop();
            return;
          }
          applyOwnProfileRef.current(profile);
          if (pending.entitlement === 'filter' && filterAccessActive && !pending.allowActiveRenewal) {
            stop(true);
            return;
          }
        }
      } catch (error) {
        console.warn('Could not confirm pending access yet; will retry within the verification window.', error);
      }
      scheduleNext();
    };

    scheduleNext();
    return () => {
      stopped = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [pendingAccessRecheck, isReady, currentUserId, filterAccessActive]);

  const retryPendingPaymentCheck = async () => {
    const pending = pendingAccessRecheckRef.current;
    const accountId = currentUserRef.current?.id;
    const now = Date.now();
    if (!pending || !accountId || accountId !== pending.accountId ||
        isPaymentRetryRunning || paidProfileVerificationInProgressRef.current) return;
    if (!canRetryPendingPaymentCheck(pending, accountId, now)) return;

    setIsPaymentRetryRunning(true);
    try {
      const retryMarker = await persistPendingAccessRecheck({
        accountId: pending.accountId,
        entitlement: pending.entitlement,
        startedAt: now,
        createdAt: pending.createdAt,
        minimumExpiry: pending.minimumExpiry,
        ...(pending.entitlement === 'filter'
          ? { location: pending.location, allowActiveRenewal: pending.allowActiveRenewal }
          : {}),
      });
      if (!retryMarker) return;

      accessRecheckAttemptsRef.current = {
        key: `${retryMarker.accountId}:${retryMarker.entitlement}:${retryMarker.startedAt}`,
        attempts: 0,
      };
      const confirmsThisAccount = (profile: any) =>
        isPendingAccessConfirmed(retryMarker, profile);
      const profile = await waitForPaidProfile(confirmsThisAccount, false, retryMarker);
      if (profile && confirmsThisAccount(profile)) {
        confirmPendingAccess(retryMarker, profile as UserProfile);
      }
    } catch (error) {
      console.warn('Manual paid-access verification did not finish.', error);
    } finally {
      setIsPaymentRetryRunning(false);
    }
  };

  const loadFilterPrefs = () => {
    try {
      let subUntil = filterSubUntilRef.current;
      // Drop expired cached subscriptions so stale localStorage can't grant access.
      if (subUntil && subUntil <= raffleClock) {
        subUntil = 0;
        try { localStorage.removeItem(FILTER_SUB_KEY); } catch {}
      }
      setFilterSubUntil(subUntil); filterSubUntilRef.current = subUntil;
      const saved = loadFilterPreferences(localStorage, currentUser?.id, filterAccessActive);
      if (!filterAccessActive) {
        resetFilterPreferences(false);
        return;
      }
      if (!saved) { resetFilterPreferences(false); return; }
      setHideNonMatchingUsers(!!saved.hideNonMatching);
      setFilterAgeOn(!!saved.ageOn);
      if (typeof saved.ageMin === 'number') setFilterAgeMin(saved.ageMin);
      if (typeof saved.ageMax === 'number') setFilterAgeMax(saved.ageMax);
      setFilterHeightOn(!!saved.heightOn);
      if (typeof saved.heightMin === 'number') setFilterHeightMin(saved.heightMin);
      if (typeof saved.heightMax === 'number') setFilterHeightMax(saved.heightMax);
      setFilterGenderVals(normalizeGenderFilterValues(saved.genderVals));
      setFilterPrefMatcherOn(saved.prefMatcherOn !== false);
      if (saved.roleVal !== undefined) setFilterRoleVal(saved.roleVal);
      if (saved.safetyVal !== undefined) setFilterSafetyVal(saved.safetyVal === 'Off' ? null : saved.safetyVal);
      if (saved.playstyleVal !== undefined) setFilterPlaystyleVal(saved.playstyleVal === 'Off' ? null : saved.playstyleVal);
      if (saved.howManyVal !== undefined) {
        setFilterHowManyVal(normalizeHowManyFilterValue(saved.howManyVal));
      }
      if (saved.whereVal !== undefined) setFilterWhereVal(saved.whereVal === 'Off' ? null : saved.whereVal);
    } catch (e) {
      console.error('Load filter prefs error:', e);
      resetFilterPreferences();
    }
  };
  loadFilterPrefsRef.current = loadFilterPrefs;

  const persistFilterPrefs = (next: any) => {
    try {
      if (!currentUser?.id) return;
      if (!paidUnlocked && filterSubUntilRef.current <= raffleClock) return;
      const saved = { hideNonMatching: next.hideNonMatching !== undefined ? next.hideNonMatching : hideNonMatchingUsers, ageOn: next.ageOn !== undefined ? next.ageOn : filterAgeOn, ageMin: next.ageMin !== undefined ? next.ageMin : filterAgeMin, ageMax: next.ageMax !== undefined ? next.ageMax : filterAgeMax, heightOn: next.heightOn !== undefined ? next.heightOn : filterHeightOn, heightMin: next.heightMin !== undefined ? next.heightMin : filterHeightMin, heightMax: next.heightMax !== undefined ? next.heightMax : filterHeightMax, genderVals: next.genderVals !== undefined ? normalizeGenderFilterValues(next.genderVals) : filterGenderVals, prefMatcherOn: next.prefMatcherOn !== undefined ? next.prefMatcherOn : filterPrefMatcherOn, roleVal: next.roleVal !== undefined ? next.roleVal : filterRoleVal, safetyVal: next.safetyVal !== undefined ? next.safetyVal : filterSafetyVal, playstyleVal: next.playstyleVal !== undefined ? next.playstyleVal : filterPlaystyleVal, howManyVal: next.howManyVal !== undefined ? next.howManyVal : filterHowManyVal, whereVal: next.whereVal !== undefined ? next.whereVal : filterWhereVal };
      saveFilterPreferences(localStorage, currentUser.id, saved);
    } catch (e) { console.error('Persist filter prefs error:', e); }
  };

  useEffect(() => {
    if (!isReady || !currentUser?.id) return;
    loadFilterPrefsRef.current?.();
  }, [isReady, currentUser?.id, filterAccessActive]);

  useEffect(() => {
    const accountId = currentUser?.id ?? null;
    if (!isReady || !accountId) {
      previousFilterAccessRef.current = { accountId: null, active: false };
      return;
    }

    const previous = previousFilterAccessRef.current;
    const current = { accountId, active: filterAccessActive };
    if (shouldNotifyFilterAccessEnded(previous, current)) {
      const eventKey = [
        accountId,
        isAdmin ? 'admin' : '',
        isVip ? 'vip' : '',
        vipExpiry || '',
        globalVipUntil,
        filterSubUntil,
      ].join('|');
      if (filterAccessNoticeEventRef.current !== eventKey) {
        filterAccessNoticeEventRef.current = eventKey;
        setFilterAccessNotice('ended');
      }
    } else if (shouldNotifyFilterAccessRestored(previous, current)) {
      setFilterAccessNotice('restored');
    }
    previousFilterAccessRef.current = current;
  }, [isReady, currentUser?.id, filterAccessActive, isAdmin, isVip, vipExpiry, globalVipUntil, filterSubUntil, lang]);

  useEffect(() => {
    const activeUserId = currentUser?.id;
    const activeUserDob = currentUser?.dob;
    if (!isReady || !activeUserId || !hideAge) return;
    const hideAgeUntil = hideAgeExpiry ? Date.parse(hideAgeExpiry) : 0;
    const paidHideAgeActive = Number.isFinite(hideAgeUntil) && hideAgeUntil > raffleClock;
    if (paidUnlocked || paidHideAgeActive) return;

    setHideAgeNotice('ended');
    const ownAge = calculateAge(activeUserDob);
    setHideAge(false);
    setHideAgeExpiry(null);
    setCurrentUser((previous) => previous?.id === activeUserId
      ? { ...previous, hide_age: false, hide_age_expiry: null, age: ownAge }
      : previous);
    setUsers((previous) => previous.map((user) => user.id === activeUserId
      ? { ...user, hide_age: false, age: calculateAge(user.dob) ?? ownAge }
      : user));
    setSelectedProfile((previous) => previous?.id === activeUserId
      ? { ...previous, hide_age: false, hide_age_expiry: null, age: calculateAge(previous.dob) ?? ownAge }
      : previous);
    void workerPostRef.current('/api/profile', { profile: { hide_age: false } })
      .catch((error) => console.warn('Could not restore age visibility after entitlement expiry:', error));
  }, [isReady, currentUser?.id, currentUser?.dob, hideAge, hideAgeExpiry, paidUnlocked, raffleClock]);

  useEffect(() => {
    const activeUserId = currentUser?.id;
    if (!isReady || !activeUserId || gridVisible || !invisibleExpiry) return;
    const expiresAt = Date.parse(invisibleExpiry);
    if (!Number.isFinite(expiresAt)) return;

    let active = true;
    let timer: number | null = null;
    const restoreGridVisibility = async () => {
      const waitMs = expiresAt - Date.now();
      if (waitMs > 0) {
        timer = window.setTimeout(() => { void restoreGridVisibility(); }, waitMs);
        return;
      }

      try {
        const result = await workerPostRef.current('/api/profile', { profile: { grid_visible: true } });
        const profile = result?.profile;
        if (!active) return;
        if (!profile || profile.grid_visible !== true) {
          throw new Error('The server did not confirm restored grid visibility.');
        }
        applyOwnProfile(profile);
        setUsers((previous) => previous.map((user) => user.id === activeUserId
          ? { ...user, ...profile, grid_visible: true }
          : user));
        if (!paidUnlocked) setInvisibleNotice('ended');
        void fetchUsersDataRef.current?.();
      } catch (error) {
        console.warn('Could not restore grid visibility after invisibility expiry; retrying:', error);
        if (active) timer = window.setTimeout(() => { void restoreGridVisibility(); }, 15_000);
      }
    };

    timer = window.setTimeout(() => { void restoreGridVisibility(); }, Math.max(0, expiresAt - Date.now()));
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isReady, currentUser?.id, gridVisible, invisibleExpiry, paidUnlocked]);

  useEffect(() => {
    const activeUserId = currentUser?.id;
    if (!isReady || !activeUserId || !hideAge || !paidUnlocked) return;
    const now = Date.now();
    const boundedVipExpiries = [
      vipExpiry ? Date.parse(vipExpiry) : 0,
      globalVipUntil,
    ].filter((expiry) => Number.isFinite(expiry) && expiry > now);
    const vipUntil = Math.max(0, ...boundedVipExpiries);
    const savedHideAgeUntil = hideAgeExpiry ? Date.parse(hideAgeExpiry) : 0;
    if (!vipUntil || vipUntil <= savedHideAgeUntil || hideAgeSyncTargetRef.current >= vipUntil) return;

    hideAgeSyncTargetRef.current = vipUntil;
    void workerPostRef.current('/api/profile', { profile: { hide_age: true } })
      .then((result) => {
        const profile = result?.profile;
        if (!profile || typeof profile !== 'object') return;
        setHideAgeExpiry(profile.hide_age_expiry || null);
        setCurrentUser((previous) => previous?.id === activeUserId ? { ...previous, ...profile } : previous);
        setUsers((previous) => previous.map((user) => user.id === activeUserId ? { ...user, ...profile } : user));
        setSelectedProfile((previous) => previous?.id === activeUserId ? { ...previous, ...profile } : previous);
      })
      .catch((error) => {
        hideAgeSyncTargetRef.current = 0;
        console.warn('Could not extend hidden-age access through VIP:', error);
      });
  }, [isReady, currentUser?.id, hideAge, hideAgeExpiry, paidUnlocked, vipExpiry, globalVipUntil]);

  const handleRenewInvisibility = async (allowActiveRenewal = false) => {
    if (!currentUser || invisiblePurchaseInProgressRef.current) return;
    const passActive = isPaidEntitlementActive({
      grid_visible: gridVisible,
      invisible_expiry: invisibleExpiry,
    }, 'invisible');
    if (allowActiveRenewal !== passActive) return;
    if (hasPendingPaymentVerification()) {
      alert(t('paymentProcessing'));
      return;
    }
    if (!window.confirm(t('invisiblePrompt'))) return;
    invisiblePurchaseInProgressRef.current = true;
    setIsInvisibleRenewing(true);
    let marker: PendingAccessRecheck | null = null;
    try {
      const currentExpiry = invisibleExpiry ? Date.parse(invisibleExpiry) : 0;
      const minimumExpiry = getMinimumPaidEntitlementExpiry(Date.now(), currentExpiry);
      const status = await startPurchase('invisible');
      if (status === 'paid') {
        marker = await persistPendingAccessRecheck({
          accountId: currentUser.id,
          entitlement: 'invisible',
          minimumExpiry,
        });
        const profile = await waitForPaidProfile((value) =>
          isPaidEntitlementConfirmed('paid', value, 'invisible', minimumExpiry),
          false,
          marker,
        );
        const outcome = getPaidEntitlementOutcome(status, profile, 'invisible', minimumExpiry);
        if (outcome === 'confirmed' && profile) {
          clearPendingAccessRecheck(marker);
          setInvisibleNotice('active');
          setView('grid');
          try {
            await fetchUsersData();
          } catch (error) {
            console.warn('Invisibility was confirmed, but the profile list did not refresh:', error);
          }
          return;
        }
        if (outcome === 'pending') alert(t('paymentProcessing'));
      } else if (status !== 'unsupported') {
        alert(t('paymentCancelled'));
      }
    } catch (error) {
      console.error('Invisible invoice error:', error);
      alert(marker || hasPendingPaymentVerification() ? t('paymentProcessing') : t('paymentCancelled'));
    } finally {
      invisiblePurchaseInProgressRef.current = false;
      setIsInvisibleRenewing(false);
    }
  };

  const handleToggleGrid = async () => {
    if (!gridFilterEnabled || !currentUser || invisiblePurchaseInProgressRef.current) return;
    const nextVal = !gridVisible;
    if (!nextVal && !paidUnlocked) {
      const expiry = invisibleExpiry ? new Date(invisibleExpiry).getTime() : 0;
      if (expiry <= Date.now()) {
        await handleRenewInvisibility();
        return;
      }
    }
    try {
      const result = await workerPost('/api/profile', { profile: { grid_visible: nextVal } });
      applyOwnProfile(result.profile);
      if (result.profile?.grid_visible === false) setInvisibleNotice('active');
      else setInvisibleNotice('');
      setView('grid');
      await fetchUsersData();
    } catch (error) {
      console.error('Could not update grid visibility:', error);
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleToggleMap = async () => {
    if (!mapModuleEnabled || !currentUser) return;
    const nextVal = !mapVisible;
    if (nextVal && !hasMainProfileImage) {
      const message = MAP_PROFILE_PHOTO_REQUIRED_COPY[lang];
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
      } else {
        window.alert(message);
      }
      return;
    }
    try {
      const result = await workerPost('/api/profile', { profile: { map_visible: nextVal } });
      applyOwnProfile(result.profile);
      setView(nextVal ? 'map' : gridFilterEnabled ? 'grid' : 'map');
      if (nextVal) setHasOpenedMap(true);
      await fetchUsersData();
    } catch (error) {
      console.error('Could not update map visibility:', error);
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleUpdateSelfField = async (fields: Partial<UserProfile>) => {
    if (!currentUser) return;
    try {
      const result = await workerPost('/api/profile', { profile: fields });
      applyOwnProfile(result.profile);
      if ('hide_age' in fields) {
        if (fields.hide_age === true && result.profile?.hide_age === true) setHideAgeNotice('active');
        else if (fields.hide_age === false && result.profile?.hide_age === false) setHideAgeNotice('');
      }
      await fetchUsersData();
    } catch (error) {
      if ('where_pref' in fields) setWherePref(currentUser.where_pref || null);
      if ('playstyle_pref' in fields) {
        setPlaystylePref(currentUser.playstyle_pref || 'Clean');
        setFilterPlaystyleVal(currentUser.playstyle_pref || null);
      }
      setSelectedProfile((previous) => previous ? { ...previous, ...currentUser } : previous);
      console.error('Could not update profile field:', error);
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRenewHideAge = async (allowActiveRenewal = false) => {
    if (!currentUser || hideAgePurchaseInProgressRef.current) return;
    const passActive = isPaidEntitlementActive({
      hide_age: hideAge,
      hide_age_expiry: hideAgeExpiry,
    }, 'hideAge');
    if (allowActiveRenewal ? (!passActive || paidUnlocked) : passActive) return;
    if (hasPendingPaymentVerification()) {
      alert(t('paymentProcessing'));
      return;
    }
    if (!window.confirm(t('hideAgePrompt'))) return;
    hideAgePurchaseInProgressRef.current = true;
    setIsHideAgeRenewing(true);
    let marker: PendingAccessRecheck | null = null;
    try {
      const currentExpiry = hideAgeExpiry ? Date.parse(hideAgeExpiry) : 0;
      const minimumExpiry = getMinimumPaidEntitlementExpiry(Date.now(), currentExpiry);
      const status = await startPurchase('hide_age');
      if (status === 'paid') {
        marker = await persistPendingAccessRecheck({
          accountId: currentUser.id,
          entitlement: 'hideAge',
          minimumExpiry,
        });
        const profile = await waitForPaidProfile((value) =>
          isPaidEntitlementConfirmed('paid', value, 'hideAge', minimumExpiry),
          false,
          marker,
        );
        const outcome = getPaidEntitlementOutcome(status, profile, 'hideAge', minimumExpiry);
        if (outcome === 'confirmed' && profile) {
          clearPendingAccessRecheck(marker);
          setHideAgeNotice('active');
          return;
        }
        if (outcome === 'pending') alert(t('paymentProcessing'));
      } else if (status !== 'unsupported') {
        alert(t('paymentCancelled'));
      }
    } catch (error) {
      console.error('Hide age invoice error:', error);
      alert(marker || hasPendingPaymentVerification() ? t('paymentProcessing') : t('paymentCancelled'));
    } finally {
      hideAgePurchaseInProgressRef.current = false;
      setIsHideAgeRenewing(false);
    }
  };

  const handleHideAgeToggle = async () => {
    if (!currentUser || hideAgePurchaseInProgressRef.current) return;
    const nextHide = !hideAge;
    if (nextHide && !paidUnlocked) {
      const expiry = hideAgeExpiry ? new Date(hideAgeExpiry).getTime() : 0;
      if (expiry <= Date.now()) {
        await handleRenewHideAge();
        return;
      }
    }
    await handleUpdateSelfField({ hide_age: nextHide });
  };

  const handleResetProfile = async () => {
    if (!currentUser) return;
    if (paidUnlocked) { setShowProfileEditModal(true); return; }
    const existingEditExpiry = Date.parse((currentUser as any).edit_profile_expiry || '');
    if ((currentUser as any).edit_profile_pass === true &&
        Number.isFinite(existingEditExpiry) && existingEditExpiry > Date.now()) {
      setShowProfileEditModal(true);
      return;
    }
    if (hasPendingPaymentVerification()) {
      alert(t('paymentProcessing'));
      return;
    }
    const confirmed = window.confirm(t('unlockPreferencePrompt'));
    if (!confirmed) return;
    let marker: PendingAccessRecheck | null = null;
    try {
      const status = await startPurchase('edit_profile');
      if (status === 'paid') {
        const minimumExpiry = Date.now() + 1;
        marker = await persistPendingAccessRecheck({
          accountId: currentUser.id,
          entitlement: 'editProfile',
          minimumExpiry,
        });
        const profile = await waitForPaidProfile((value) =>
          isPaidEntitlementConfirmed('paid', value, 'editProfile', minimumExpiry),
          false,
          marker,
        );
        if (profile && isPaidEntitlementConfirmed('paid', profile, 'editProfile', minimumExpiry)) {
          clearPendingAccessRecheck(marker);
          setShowProfileEditModal(true);
        } else {
          alert(t('paymentProcessing'));
        }
      } else if (status !== 'unsupported') {
        alert(t('paymentCancelled'));
      }
    } catch (err) {
      console.error('Reset profile invoice error:', err);
      alert(marker ? t('paymentProcessing') : t('paymentCancelled'));
    }
  };

  const handleCardClick = (targetUser: UserProfile) => {
    setShowFilterDropdown(false);
    setInterestFeedback(null);
    setSelectedProfile(targetUser);
    if (currentUser && targetUser.id !== currentUser.id) loadPrivateNote(targetUser.id);
    else { setNoteDraft(''); setShowNoteBox(false); }
  };

  const handleStartChat = (targetUser: UserProfile) => {
    if (!checkFilterPass(targetUser)) return;
    if (targetUser.username) {
      const chatUrl = `https://t.me/${targetUser.username}`;
      if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(chatUrl);
      else window.open(chatUrl, '_blank');
    } else if (targetUser.id.startsWith('tg_')) {
      const rawTgId = targetUser.id.replace('tg_', '');
      const profileUrl = `https://t.me/user?id=${rawTgId}`;
      if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(profileUrl);
      else window.open(profileUrl, '_blank');
    } else { alert(t('selectedUser').replace('{n}', targetUser.name)); }
    setSelectedProfile(null);
  };

  const passesMandatoryGenderAccess = (user: UserProfile) => {
    if (currentUser && user.id === currentUser.id) return true;
    const botKey = verifiedBotKeyRef.current || entry.botKey;
    return matchesEntryGenderAccess(
      botKey,
      filterAccessActive,
      vipEntitlementActive,
      currentUser?.seeking ?? seeking,
      user.gender,
    );
  };

  const checkFilterPass = (user: UserProfile) => {
    if (!passesMandatoryGenderAccess(user)) return false;
    if (!gridFilterEnabled) return true;
    if (currentUser && user.id === currentUser.id) return true;
    if ((filterAccessActive || hkmoMenOnlyFilterLocked) &&
        !matchesGenderFilter(effectiveFilterGenderVals, user.gender)) return false;
    if (filterAgeOn) { const age = typeof user.age === 'number' ? user.age : calculateAge(user.dob); if (age === null || age < filterAgeMin || age > filterAgeMax) return false; }
    if (filterHeightOn) { const h = parseHeightMeters(user.height); if (h === null || h < filterHeightMin || h > filterHeightMax) return false; }
    const userIsManSeekingMan = user.gender === 'man' && user.seeking === 'men';
    if (filterPrefMatcherOn && userIsManSeekingMan) {
      if (filterRoleVal && filterRoleVal !== 'Off') {
        if (filterRoleVal === 'VT') { if (user.role_pref !== 'Versatile' && user.role_pref !== 'Top') return false; }
        else if (filterRoleVal === 'VB') { if (user.role_pref !== 'Versatile' && user.role_pref !== 'Bottom') return false; }
        else { if (user.role_pref !== filterRoleVal && user.role_pref !== 'Versatile') return false; }
      }
      if (filterSafetyVal && filterSafetyVal !== 'Off') { if (user.safety_pref !== filterSafetyVal) return false; }
      if (filterPlaystyleVal && filterPlaystyleVal !== 'Off') {
        if (filterPlaystyleVal === 'Party') { if (user.playstyle_pref !== 'Party' && user.playstyle_pref !== 'Party✓') return false; }
        else if (user.playstyle_pref !== filterPlaystyleVal) return false;
      }
      if (!matchesHowManyFilter(filterHowManyVal, user.how_many_pref)) return false;
      if (filterWhereVal && filterWhereVal !== 'Off') { if (user.where_pref !== filterWhereVal) return false; }
    }
    return true;
  };

  const handleSendInterest = async (targetUser: UserProfile) => {
    if (!currentUser || targetUser.id === currentUser.id || !checkFilterPass(targetUser)) return;
    if (targetUser.interest_state_known !== true) {
      setInterestFeedback({ profileId: targetUser.id, state: 'unavailable' });
      return;
    }
    const existingCooldown = Date.parse(targetUser.interest_cooldown_until || '');
    if (Number.isFinite(existingCooldown) && existingCooldown > raffleClock) {
      setInterestFeedback({ profileId: targetUser.id, state: 'cooldown' });
      return;
    }
    if (interestSendingTo) return;

    setInterestSendingTo(targetUser.id);
    setInterestFeedback(null);
    try {
      const result = await workerPostRef.current('/api/profile-interest/send', {
        recipientId: targetUser.id,
      });
      const cooldownUntil = typeof result?.cooldownUntil === 'string' &&
        Number.isFinite(Date.parse(result.cooldownUntil))
        ? result.cooldownUntil
        : null;
      if (!cooldownUntil || (result.status !== 'sent' && result.status !== 'cooldown')) {
        throw new Error('Interest response was invalid.');
      }
      setUsers((previous) => previous.map((user) =>
        user.id === targetUser.id
          ? { ...user, interest_cooldown_until: cooldownUntil, interest_state_known: true }
          : user
      ));
      setSelectedProfile((previous) => previous?.id === targetUser.id
        ? { ...previous, interest_cooldown_until: cooldownUntil, interest_state_known: true }
        : previous
      );
      setInterestFeedback({
        profileId: targetUser.id,
        state: result.status === 'sent' ? 'sent' : 'cooldown',
      });
    } catch {
      setInterestFeedback({ profileId: targetUser.id, state: 'failed' });
    } finally {
      setInterestSendingTo((previous) => previous === targetUser.id ? null : previous);
    }
  };

  const handleOpenExternalApp = (url: string) => {
    if (url.includes('t.me') && window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
    else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
    else window.open(url, '_blank');
  };

  // On app load: read ALL existing private notes from Telegram CloudStorage
  // (falling back to localStorage) so each profile card shows its saved note.
  const NOTE_PREFIX = 'whos_nearby_private_note_';
  useEffect(() => {
    const hydrate = (k: string, val: string | null | undefined) => {
      const text = parseNotePayload(val);
      if (text === null) return;
      const targetId = k.slice(NOTE_PREFIX.length).split('_').slice(1).join('_');
      if (!targetId) return;
      setNotesMap((m) => (m[targetId] === text ? m : { ...m, [targetId]: text }));
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NOTE_PREFIX)) hydrate(k, localStorage.getItem(k));
      }
    } catch {}
    const cs: any = window.Telegram?.WebApp?.CloudStorage;
    if (cs?.getItems) {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(NOTE_PREFIX)) keys.push(k);
        }
        cs.getItems(keys, (err: any, val: any) => { if (!err && val) Object.entries(val).forEach(([k, v]) => hydrate(k, v as string)); });
      } catch {}
    } else if (cs?.getItem) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(NOTE_PREFIX)) cs.getItem(k, (err: any, val: any) => { if (!err) hydrate(k, val); });
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (!isReady) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif' }}><p>{t('loading')}</p></div>;
  }
  if (isLocationDenied) {
    return (
      <main
        role="main"
        aria-labelledby="location-required-title"
        data-testid="screen-location-required"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', width: '100%', backgroundColor: '#121212', color: '#ff4d4d', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}
      >
        <h1 id="location-required-title" data-testid="text-location-required" style={{ fontSize: '24px', marginBottom: '16px' }}>
          {t('locationRequired')}
        </h1>
        <p data-testid="text-location-instructions" style={{ fontSize: '16px', color: '#ffffff', maxWidth: '360px', lineHeight: '1.5' }}>
          {t('locationMessage')}
        </p>
        <button
          type="button"
          data-testid="button-location-retry"
          onClick={() => window.location.reload()}
          style={{ marginTop: '20px', minHeight: '44px', padding: '12px 22px', border: 0, borderRadius: '10px', background: '#3b82f6', color: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
        >
          {t('refresh')}
        </button>
      </main>
    );
  }
  if (startupError) {
    return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}><h2 style={{ fontSize: '22px', marginBottom: '12px' }}>{t('accessDenied')}</h2><p style={{ maxWidth: '360px', lineHeight: '1.5', color: '#ffb4b4' }}>{startupError}</p><button type="button" onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '12px 22px', border: 0, borderRadius: '10px', background: '#3b82f6', color: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>{t('refresh')}</button></div>;
  }
  if (isUnderageLocked) {
    return <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ff4d4d', fontFamily: 'sans-serif', padding: '20px', textAlign: 'center', boxSizing: 'border-box' }}><h2 style={{ fontSize: '24px', marginBottom: '16px' }}>{t('accessDenied')}</h2><p style={{ fontSize: '16px', color: '#ffffff', maxWidth: '360px', lineHeight: '1.5' }}>{t('underageMessage')}</p></div>;
  }

  const noteKeyFor = (targetId: string | undefined) => {
    const viewerId = currentUser?.id || localStorage.getItem('whos_nearby_user_id') || 'anon';
    return `whos_nearby_private_note_${viewerId}_${targetId}`;
  };

  // Private notes are stored ONLY in Telegram CloudStorage (bot-scoped, per-user)
  // with a localStorage cache. They are never written to Supabase.
  // Stored payload: JSON { t: text, x: expiryEpochMs|null } (expiry = 30 days
  // from last save, using the same 30-day window as other subscriptions).
  const NOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  const parseNotePayload = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try {
      const p = JSON.parse(raw);
      if (p && typeof p.t === 'string') {
        if (p.x && Number(p.x) < Date.now()) return null; // expired
        return (p.t || '').slice(0, 100);
      }
    } catch {}
    return raw.slice(0, 100); // legacy plain-text value
  };

  const loadPrivateNote = (targetId: string | undefined) => {
    if (!targetId || targetId === currentUser?.id) { setNoteDraft(''); setShowNoteBox(false); return; }
    const key = noteKeyFor(targetId);
    const apply = (val: string | null | undefined) => { const text = parseNotePayload(val); if (text !== null) { setNoteDraft(text); setNotesMap((m) => ({ ...m, [targetId]: text })); setShowNoteBox(text.trim().length > 0); } };
    setNoteDraft(notesMap[targetId] || '');
    setShowNoteBox((notesMap[targetId] || '').trim().length > 0);
    try {
      const local = localStorage.getItem(key);
      if (local !== null) apply(local);
    } catch {}
    try {
      const cs = window.Telegram?.WebApp?.CloudStorage;
      cs?.getItem?.(key, (err, val) => { if (!err) apply(val); });
    } catch {}
  };

  const savePrivateNote = (targetId: string | undefined, value: string) => {
    if (!targetId || targetId === currentUser?.id) return;
    const text = (value || '').slice(0, 100);
    setNoteDraft(text);
    setShowNoteBox(text.trim().length > 0);
    setNotesMap((m) => ({ ...m, [targetId]: text }));
    const key = noteKeyFor(targetId);
    const payload = JSON.stringify({ t: text, x: text ? Date.now() + NOTE_TTL_MS : null });
    try { localStorage.setItem(key, payload); } catch {}
    try { window.Telegram?.WebApp?.CloudStorage?.setItem?.(key, payload); } catch {}
  };

  const handleForceReset = async () => {
    if (!selectedProfile) return;
    const targetId = selectedProfile.id;
    const copy = adminProfileActionCopy[lang];
    if (!window.confirm(copy.resetSingleConfirm(selectedProfile.name || ''))) return;
    try {
      await workerPost('/api/reset-profile', { target_id: targetId });
      setSelectedProfile((profile) =>
        profile?.id === targetId ? { ...profile, dob: null, age: null } : profile,
      );
      setUsers((profiles) => profiles.map((profile) =>
        profile.id === targetId ? { ...profile, dob: null, age: null } : profile,
      ));
      alert(copy.resetSingleDone);
    } catch (e) { console.error(e); alert(formatAdminFailure(e, t('resetFailed'))); }
  };

  const handleForceSwapSex = async () => {
    if (!isAdmin || !selectedProfile) return;
    const currentGender = selectedProfile.gender;
    if (currentGender !== 'man' && currentGender !== 'woman') {
      alert(adminProfileActionCopy[lang].swapSexUnavailable);
      return;
    }
    const nextGender = currentGender === 'man' ? 'woman' : 'man';
    const copy = adminProfileActionCopy[lang];
    if (!window.confirm(copy.swapSexConfirm(
      selectedProfile.name || '',
      t(currentGender),
      t(nextGender),
    ))) return;
    try {
      const targetId = selectedProfile.id;
      const result = await workerPost('/api/force-swap-sex', { target_id: targetId });
      if (result?.gender !== nextGender) throw new Error('The server did not confirm the gender change.');
      setSelectedProfile((profile) =>
        profile?.id === targetId ? { ...profile, gender: nextGender } : profile,
      );
      setUsers((profiles) => profiles.map((profile) =>
        profile.id === targetId ? { ...profile, gender: nextGender } : profile,
      ));
      alert(copy.swapSexDone(t(nextGender)));
    } catch (error) {
      console.error(error);
      alert(formatAdminFailure(error, copy.swapSexFailed));
    }
  };

  const loadRoles = async () => {
    setRolesLoading(true);
    setRolesLoadError('');
    try {
      const data = await workerPost('/api/roles', { action: 'list' });
      if (!Array.isArray(data)) throw new Error('Invalid admin/VIP list response');
      setRoles(data as { username: string; role: string }[]);
    } catch (error) {
      console.error('Could not load managed roles:', error);
      setRolesLoadError(t('roleUpdateFailed'));
    } finally {
      setRolesLoading(false);
    }
  };

  const loadAdminPayments = async (
    search = paymentsSearch,
    offset = 0,
    append = false,
  ) => {
    const requestSequence = ++paymentReviewRequestRef.current;
    const viewerId = currentUser?.id;
    if (!viewerId || !isAdmin) return;
    setPaymentsLoading(true);
    setPaymentsError('');
    try {
      const result = await workerPost('/api/admin/payments', {
        action: 'list',
        search,
        offset,
      });
      const page = parsePaymentReviewPage(result);
      if (requestSequence !== paymentReviewRequestRef.current ||
          currentUser?.id !== viewerId ||
          !isAdmin) return;
      setPaymentRecords((current) => {
        if (!append) return page.payments;
        const combined = new Map(current.map((payment) => [payment.paymentId, payment]));
        for (const payment of page.payments) combined.set(payment.paymentId, payment);
        return Array.from(combined.values());
      });
      setPaymentsHasMore(page.hasMore);
    } catch (error) {
      if (requestSequence === paymentReviewRequestRef.current &&
          currentUser?.id === viewerId &&
          isAdmin) {
        console.error('Could not load payment review:', error);
        setPaymentsError(formatAdminFailure(error, paymentReviewCopy[lang].loadError));
      }
    } finally {
      if (requestSequence === paymentReviewRequestRef.current) {
        setPaymentsLoading(false);
      }
    }
  };

  const loadRafflePaymentReview = async (
    search = rafflePaymentSearch,
    offset = 0,
    append = false,
  ) => {
    const requestSequence = ++rafflePaymentReviewRequestRef.current;
    const viewerId = currentUser?.id;
    if (!viewerId || !isAdmin) return;
    setRafflePaymentLoading(true);
    setRafflePaymentError('');
    try {
      const result = await workerPost('/api/admin/raffle-payments', {
        action: 'list',
        search,
        offset,
      });
      const page = parseRafflePaymentReviewPage(result);
      if (requestSequence !== rafflePaymentReviewRequestRef.current ||
          currentUser?.id !== viewerId ||
          !isAdmin) return;
      setRafflePaymentIntents((current) => {
        if (!append) return page.intents;
        const combined = new Map(current.map((intent) => [intent.intentId, intent]));
        for (const intent of page.intents) combined.set(intent.intentId, intent);
        return Array.from(combined.values());
      });
      setRafflePaymentHasMore(page.hasMore);
    } catch (error) {
      if (requestSequence === rafflePaymentReviewRequestRef.current &&
          currentUser?.id === viewerId &&
          isAdmin) {
        console.error('Could not load raffle payment recovery records:', error);
        setRafflePaymentError(formatAdminFailure(
          error,
          paymentReviewCopy[lang].loadError,
        ));
      }
    } finally {
      if (requestSequence === rafflePaymentReviewRequestRef.current) {
        setRafflePaymentLoading(false);
      }
    }
  };

  const recoverRafflePayment = async (
    intentId: string,
    recoveryAction: 'fulfill' | 'refund',
  ) => {
    const viewerId = currentUser?.id;
    if (!viewerId || !isAdmin || !showPaymentReview || raffleRecoveringIntentId) return;
    const recoveryId = window.crypto?.randomUUID?.();
    if (!recoveryId) {
      setRaffleRecoveryError('Secure recovery requests are unavailable in this browser.');
      setRaffleRecoveryNotice('');
      return;
    }

    const requestSequence = ++raffleRecoveryRequestRef.current;
    setRaffleRecoveringIntentId(intentId);
    setRaffleRecoveryNotice('');
    setRaffleRecoveryError('');
    try {
      const result = parseRaffleRecoveryResult(await workerPost('/api/admin/raffle-payments', {
        action: 'recover',
        intentId,
        recoveryId,
        recoveryAction,
      }));
      if (requestSequence !== raffleRecoveryRequestRef.current ||
          currentUser?.id !== viewerId ||
          !isAdmin ||
          !showPaymentReview) return;
      const resultLabel = rafflePaymentReviewCopy[lang].statusLabels[result.status] || result.status;
      setRaffleRecoveryNotice(
        `${rafflePaymentReviewCopy[lang].actionLabel[result.action]}: ${resultLabel}`,
      );
      await loadRafflePaymentReview(rafflePaymentSearch, 0, false);
    } catch (error) {
      if (requestSequence === raffleRecoveryRequestRef.current &&
          currentUser?.id === viewerId &&
          isAdmin &&
          showPaymentReview) {
        console.error('Could not recover raffle payment:', error);
        setRaffleRecoveryError(formatAdminFailure(
          error,
          paymentReviewCopy[lang].loadError,
        ));
        await loadRafflePaymentReview(rafflePaymentSearch, 0, false);
      }
    } finally {
      if (requestSequence === raffleRecoveryRequestRef.current) {
        setRaffleRecoveringIntentId(null);
      }
    }
  };

  const loadPassPaymentLookup = async (
    search = passLookupSearch,
    searchBy = passLookupSearchBy,
  ) => {
    const requestSequence = ++passPaymentLookupRequestRef.current;
    const viewerId = currentUser?.id;
    const normalizedSearch = search.trim();
    if (!viewerId || !isAdmin || !normalizedSearch) {
      setPassLookupLoading(false);
      setPassLookupResult(null);
      setPassLookupError('');
      return;
    }

    setPassLookupLoading(true);
    setPassLookupError('');
    setPassLookupResult(null);
    try {
      const result = await workerPost('/api/admin/payments', {
        action: 'lookup_pass',
        searchBy,
        search: normalizedSearch,
      });
      const lookup = parsePassPaymentLookup(result);
      if (requestSequence !== passPaymentLookupRequestRef.current ||
          currentUser?.id !== viewerId ||
          !isAdmin) return;
      setPassLookupResult(lookup);
    } catch (error) {
      if (requestSequence === passPaymentLookupRequestRef.current &&
          currentUser?.id === viewerId &&
          isAdmin) {
        console.error('Could not load pass payment lookup:', error);
        setPassLookupError(formatAdminFailure(
          error,
          paymentReviewCopy[lang].loadError,
        ));
      }
    } finally {
      if (requestSequence === passPaymentLookupRequestRef.current) {
        setPassLookupLoading(false);
      }
    }
  };

  const openPaymentReview = () => {
    if (!isAdmin || !currentUser?.id) return;
    setShowAdminMenu(false);
    setShowRolesModal(false);
    setShowVipCampaignsModal(false);
    setPaymentsSearch('');
    setPaymentRecords([]);
    setPaymentsHasMore(false);
    setPaymentsError('');
    setRafflePaymentSearch('');
    setRafflePaymentIntents([]);
    setRafflePaymentHasMore(false);
    setRafflePaymentError('');
    setRaffleRecoveryNotice('');
    setRaffleRecoveryError('');
    setPassLookupSearch('');
    setPassLookupSearchBy('telegram_id');
    setPassLookupLoading(false);
    setPassLookupError('');
    setPassLookupResult(null);
    passPaymentLookupRequestRef.current += 1;
    setShowPaymentReview(true);
    void loadAdminPayments('', 0, false);
    void loadRafflePaymentReview('', 0, false);
  };

  const closePaymentReview = () => {
    paymentReviewRequestRef.current += 1;
    rafflePaymentReviewRequestRef.current += 1;
    raffleRecoveryRequestRef.current += 1;
    passPaymentLookupRequestRef.current += 1;
    setShowPaymentReview(false);
    setPaymentRecords([]);
    setPaymentsHasMore(false);
    setPaymentsLoading(false);
    setPaymentsError('');
    setPaymentsSearch('');
    setRafflePaymentIntents([]);
    setRafflePaymentHasMore(false);
    setRafflePaymentLoading(false);
    setRafflePaymentError('');
    setRafflePaymentSearch('');
    setRaffleRecoveringIntentId(null);
    setRaffleRecoveryNotice('');
    setRaffleRecoveryError('');
    setPassLookupSearch('');
    setPassLookupSearchBy('telegram_id');
    setPassLookupLoading(false);
    setPassLookupError('');
    setPassLookupResult(null);
  };

  const handleAddRole = async () => {
    const uname = newRoleUsername.trim().toLowerCase().replace(/^@/, '');
    if (!uname) return;
    if (uname === 'mileschan852') { alert(t('ownerImmutable')); return; }
    try {
      await workerPost('/api/roles', { action: 'add', username: uname, role: newRole });
      setNewRoleUsername('');
      await loadRoles();
    } catch (e) { console.error(e); alert(formatAdminFailure(e, t('roleUpdateFailed'))); }
  };

  const handleRemoveRole = async (username: string) => {
    if (username.toLowerCase() === 'mileschan852') { alert(t('ownerImmutable')); return; }
    try {
      await workerPost('/api/roles', { action: 'remove', username });
      await loadRoles();
    } catch (e) { console.error(e); alert(formatAdminFailure(e, t('roleUpdateFailed'))); }
  };

  const handleGrantGlobalVip = async (ms: number) => {
    if (ms <= 0) {
      try {
        await workerPost('/api/global-vip', { until: 0 });
        setGlobalVipUntil(0);
        setShowVipPeriods(false);
        setShowAdminMenu(false);
      } catch (e) { console.error(e); alert(formatAdminFailure(e, t('roleUpdateFailed'))); }
      return;
    }
    if (vipGrantSaveLockRef.current) return;
    vipGrantSaveLockRef.current = true;
    setSavingVipGrant(true);
    try {
      await workerPost('/api/vip-campaigns', {
        requestId: crypto.randomUUID(),
        durationDays: Math.round(ms / 86_400_000),
        eligibilityWindow: vipGrantWindowEnabled ? vipGrantWindow : null,
        randomize: randomVipDaysEnabled,
        allowNewUsers: vipGrantWindowEnabled && allowNewVipUsers,
      });
      setShowVipPeriods(false);
      setShowAdminMenu(false);
      alert(vipGrantCopy[lang].campaignCreated);
    } catch (e) { console.error(e); alert(formatAdminFailure(e, t('roleUpdateFailed'))); }
    finally {
      vipGrantSaveLockRef.current = false;
      setSavingVipGrant(false);
    }
  };

  const loadVipCampaigns = async (offset = 0, append = false) => {
    const requestSequence = ++vipCampaignListRequestRef.current;
    setVipCampaignsLoading(true);
    setVipCampaignsError('');
    if (!append) setVipCampaignsNotice('');
    try {
      const [result, { parseVipCampaignPage }] = await Promise.all([
        workerPost('/api/vip-campaigns', { action: 'list', offset }),
        loadVipCampaignPanelModule(),
      ]);
      const page = parseVipCampaignPage(result);
      if (requestSequence !== vipCampaignListRequestRef.current) return;
      setVipCampaigns((current) => {
        if (!append) return page.campaigns;
        const combined = new Map(current.map((campaign) => [campaign.id, campaign]));
        for (const campaign of page.campaigns) combined.set(campaign.id, campaign);
        return Array.from(combined.values());
      });
      setVipCampaignsHasMore(page.hasMore);
    } catch (error) {
      if (requestSequence === vipCampaignListRequestRef.current) {
        console.error('Could not load VIP campaigns:', error);
        setVipCampaignsError(formatAdminFailure(error, vipGrantCopy[lang].campaignsLoadFailed));
      }
    } finally {
      if (requestSequence === vipCampaignListRequestRef.current) setVipCampaignsLoading(false);
    }
  };

  const loadNewVipFailureAlerts = async () => {
    const requestSequence = ++vipFailureAlertRequestRef.current;
    const userId = currentUser?.id;
    if (!userId) return;
    setVipFailureAlertLoading(true);
    setVipFailureAlertError('');
    try {
      const [result, { parseVipFailureAlertSummary }] = await Promise.all([
        workerPost('/api/vip-campaigns', {
          action: 'failure_alerts',
        }),
        loadVipCampaignPanelModule(),
      ]);
      const summary = parseVipFailureAlertSummary(result);
      if (requestSequence !== vipFailureAlertRequestRef.current || currentUser?.id !== userId) return;
      vipFailureAlertOwnerRef.current = summary.newFailureCount > 0 ? userId : null;
      setVipFailureAlert(summary.newFailureCount > 0 ? summary : null);
    } catch (error) {
      if (requestSequence === vipFailureAlertRequestRef.current && currentUser?.id === userId) {
        console.error('Could not check new VIP reward notification failures:', error);
        setVipFailureAlertError(vipGrantCopy[lang].campaignNewFailureAlertLoadFailed);
      }
    } finally {
      if (requestSequence === vipFailureAlertRequestRef.current) setVipFailureAlertLoading(false);
    }
  };
  loadNewVipFailureAlertsRef.current = loadNewVipFailureAlerts;

  const loadVipRewardQueueHealth = async () => {
    const requestSequence = ++vipRewardQueueHealthRequestRef.current;
    const userId = currentUser?.id;
    if (!userId) return;
    setVipRewardQueueHealthLoading(true);
    setVipRewardQueueHealthError('');
    try {
      const [result, { parseVipRewardNotificationQueueHealth }] = await Promise.all([
        workerPost('/api/vip-campaigns', {
          action: 'queue_health',
        }),
        loadVipCampaignPanelModule(),
      ]);
      const summary = parseVipRewardNotificationQueueHealth(result);
      if (requestSequence !== vipRewardQueueHealthRequestRef.current || currentUser?.id !== userId) return;
      setVipRewardQueueHealth(summary);
    } catch (error) {
      if (requestSequence === vipRewardQueueHealthRequestRef.current && currentUser?.id === userId) {
        console.error('Could not load VIP reward notification queue health:', error);
        setVipRewardQueueHealthError(vipGrantCopy[lang].campaignQueueHealthLoadFailed);
      }
    } finally {
      if (requestSequence === vipRewardQueueHealthRequestRef.current) {
        setVipRewardQueueHealthLoading(false);
      }
    }
  };
  loadVipRewardQueueHealthRef.current = loadVipRewardQueueHealth;

  const loadFailedRewardClaims = async (campaignId: string, offset = 0, append = false) => {
    const requestSequence = ++vipFailedRewardRequestRef.current;
    if (!append) {
      setFailedRewardCampaignId(campaignId);
      setFailedRewardClaims([]);
      setFailedRewardClaimsHasMore(false);
    }
    setFailedRewardClaimsLoading(true);
    setFailedRewardClaimsError('');
    try {
      const [result, { parseVipFailedRewardPage }] = await Promise.all([
        workerPost('/api/vip-campaigns', {
          action: 'failed_rewards',
          campaignId,
          offset,
        }),
        loadVipCampaignPanelModule(),
      ]);
      const page = parseVipFailedRewardPage(result);
      if (page.claims.some((claim) => claim.campaignId !== campaignId)) {
        throw new Error('Failed reward list does not match the selected campaign');
      }
      if (requestSequence !== vipFailedRewardRequestRef.current) return;
      setFailedRewardClaims((current) => {
        if (!append) return page.claims;
        const combined = new Map(current.map((claim) => [claim.id, claim]));
        for (const claim of page.claims) combined.set(claim.id, claim);
        return Array.from(combined.values());
      });
      setFailedRewardClaimsHasMore(page.hasMore);
    } catch (error) {
      if (requestSequence === vipFailedRewardRequestRef.current) {
        console.error('Could not load failed VIP reward messages:', error);
        setFailedRewardClaimsError(formatAdminFailure(
          error,
          vipGrantCopy[lang].campaignFailedRewardsLoadFailed,
        ));
      }
    } finally {
      if (requestSequence === vipFailedRewardRequestRef.current) {
        setFailedRewardClaimsLoading(false);
      }
    }
  };

  const loadCrossCampaignFailedRewardClaims = async (
    offset = 0,
    append = false,
    search = crossCampaignFailedRewardActiveSearch,
    sourceBotKey: 'all' | 'botA' | 'botB' = crossCampaignFailedRewardActiveSourceBot,
  ) => {
    const requestSequence = ++crossCampaignFailedRewardRequestRef.current;
    const normalizedSearch = search.trim();
    if (!append) {
      setCrossCampaignFailedRewardActiveSearch(normalizedSearch);
      setCrossCampaignFailedRewardActiveSourceBot(sourceBotKey);
      setCrossCampaignFailedRewardSearched(true);
      setCrossCampaignFailedRewardClaims([]);
      setCrossCampaignFailedRewardClaimsHasMore(false);
    }
    setCrossCampaignFailedRewardClaimsLoading(true);
    setCrossCampaignFailedRewardClaimsError('');
    try {
      const [result, { parseVipFailedRewardPage }] = await Promise.all([
        workerPost('/api/vip-campaigns', {
          action: 'failed_rewards_search',
          search: normalizedSearch,
          sourceBotKey,
          offset,
        }),
        loadVipCampaignPanelModule(),
      ]);
      const page = parseVipFailedRewardPage(result);
      if (requestSequence !== crossCampaignFailedRewardRequestRef.current) return;
      setCrossCampaignFailedRewardClaims((current) => {
        if (!append) return page.claims;
        const combined = new Map(current.map((claim) => [claim.id, claim]));
        for (const claim of page.claims) combined.set(claim.id, claim);
        return Array.from(combined.values());
      });
      setCrossCampaignFailedRewardClaimsHasMore(page.hasMore);
    } catch (error) {
      if (requestSequence === crossCampaignFailedRewardRequestRef.current) {
        console.error('Could not search failed VIP reward messages across campaigns:', error);
        setCrossCampaignFailedRewardClaimsError(formatAdminFailure(
          error,
          vipGrantCopy[lang].campaignFailedRewardsLoadFailed,
        ));
      }
    } finally {
      if (requestSequence === crossCampaignFailedRewardRequestRef.current) {
        setCrossCampaignFailedRewardClaimsLoading(false);
      }
    }
  };

  const searchCrossCampaignFailedRewardClaims = (
    search: string,
    sourceBotKey: 'all' | 'botA' | 'botB',
  ) => {
    setCrossCampaignFailedRewardSearch(search);
    setCrossCampaignFailedRewardSourceBot(sourceBotKey);
    void loadCrossCampaignFailedRewardClaims(0, false, search, sourceBotKey);
  };

  const loadMoreCrossCampaignFailedRewardClaims = () => {
    if (!crossCampaignFailedRewardSearched ||
        !crossCampaignFailedRewardClaimsHasMore ||
        crossCampaignFailedRewardClaimsLoading) return;
    void loadCrossCampaignFailedRewardClaims(
      crossCampaignFailedRewardClaims.length,
      true,
      crossCampaignFailedRewardActiveSearch,
      crossCampaignFailedRewardActiveSourceBot,
    );
  };

  const loadVipRewardRetryAudit = async (campaignId: string, offset = 0, append = false) => {
    const requestSequence = ++vipRetryAuditRequestRef.current;
    if (!append) {
      setRetryAuditCampaignId(campaignId);
      setRetryAuditRecords([]);
      setRetryAuditHasMore(false);
      setRetryAuditError('');
    }
    setRetryAuditLoading(true);
    setRetryAuditError('');
    try {
      const [result, { parseVipRewardRetryAuditPage }] = await Promise.all([
        workerPost('/api/vip-campaigns', {
          action: 'retry_audit',
          campaignId,
          offset,
        }),
        loadVipCampaignPanelModule(),
      ]);
      const page = parseVipRewardRetryAuditPage(result);
      if (requestSequence !== vipRetryAuditRequestRef.current) return;
      setRetryAuditRecords((current) => {
        if (!append) return page.records;
        const combined = new Map(current.map((record) => [record.id, record]));
        for (const record of page.records) combined.set(record.id, record);
        return Array.from(combined.values());
      });
      setRetryAuditHasMore(page.hasMore);
    } catch (error) {
      if (requestSequence === vipRetryAuditRequestRef.current) {
        console.error('Could not load VIP reward retry audit:', error);
        setRetryAuditError(formatAdminFailure(
          error,
          vipGrantCopy[lang].campaignRetryAuditLoadFailed,
        ));
      }
    } finally {
      if (requestSequence === vipRetryAuditRequestRef.current) {
        setRetryAuditLoading(false);
      }
    }
  };

  const toggleVipRewardRetryAudit = (campaignId: string) => {
    if (retryAuditCampaignId === campaignId) {
      vipRetryAuditRequestRef.current += 1;
      setRetryAuditCampaignId(null);
      setRetryAuditRecords([]);
      setRetryAuditHasMore(false);
      setRetryAuditLoading(false);
      setRetryAuditError('');
      return;
    }
    void loadVipRewardRetryAudit(campaignId);
  };

  const loadMoreVipRewardRetryAudit = (campaignId: string) => {
    if (campaignId !== retryAuditCampaignId || retryAuditLoading) return;
    void loadVipRewardRetryAudit(campaignId, retryAuditRecords.length, true);
  };

  const toggleFailedRewardClaims = (campaignId: string) => {
    if (retryingFailedRewardClaimId) return;
    if (failedRewardCampaignId === campaignId) {
      vipFailedRewardRequestRef.current += 1;
      setFailedRewardCampaignId(null);
      setFailedRewardClaims([]);
      setFailedRewardClaimsHasMore(false);
      setFailedRewardClaimsLoading(false);
      setFailedRewardClaimsError('');
      return;
    }
    void loadFailedRewardClaims(campaignId);
  };

  const retryFailedVipReward = async (claimId: string) => {
    const campaignScopedClaim = failedRewardClaims.find((item) => item.id === claimId);
    const crossCampaignClaim = crossCampaignFailedRewardClaims.find((item) => item.id === claimId);
    const claim = campaignScopedClaim ?? crossCampaignClaim;
    const campaignId = claim?.campaignId ?? null;
    if (!campaignId || !claim || claim.manualRetryCount >= 3 || retryingFailedRewardClaimId) return;
    setRetryingFailedRewardClaimId(claimId);
    setFailedRewardClaimsError('');
    setCrossCampaignFailedRewardClaimsError('');
    setVipCampaignsNotice('');
    try {
      const result = await workerPost('/api/vip-campaigns', {
        action: 'retry_failed_reward',
        claimId,
      });
      if (result?.ok !== true || result.claimId !== claimId ||
          typeof result.delivered !== 'boolean' ||
          !['delivered', 'failed'].includes(result.notificationStatus) ||
          !Number.isSafeInteger(result.manualRetryCount) ||
          result.manualRetryCount !== claim.manualRetryCount + 1 ||
          result.manualRetryCount > 3) {
        throw new Error(vipGrantCopy[lang].campaignFailedRewardRetryFailed);
      }
      await Promise.all([
        loadVipCampaigns(0, false),
        ...(failedRewardCampaignId === campaignId
          ? [loadFailedRewardClaims(campaignId, 0, false)]
          : []),
        ...(crossCampaignFailedRewardSearched
          ? [loadCrossCampaignFailedRewardClaims(
            0,
            false,
            crossCampaignFailedRewardActiveSearch,
            crossCampaignFailedRewardActiveSourceBot,
          )]
          : []),
        ...(retryAuditCampaignId === campaignId
          ? [loadVipRewardRetryAudit(campaignId, 0, false)]
          : []),
      ]);
      void loadNewVipFailureAlerts();
      void loadVipRewardQueueHealth();
      setVipCampaignsNotice(result.delivered
        ? vipGrantCopy[lang].campaignFailedRewardRetrySent
        : vipGrantCopy[lang].campaignFailedRewardRetryFailed);
    } catch (error) {
      console.error('Could not retry VIP reward message:', error);
      const retryError =
        (error as Error & { notificationStatus?: string })?.notificationStatus === 'delivery_uncertain'
          ? vipGrantCopy[lang].campaignFailedRewardDeliveryUncertain
          : formatAdminFailure(error, vipGrantCopy[lang].campaignFailedRewardRetryFailed);
      if (campaignScopedClaim) setFailedRewardClaimsError(retryError);
      if (crossCampaignClaim) setCrossCampaignFailedRewardClaimsError(retryError);
    } finally {
      setRetryingFailedRewardClaimId(null);
    }
  };

  const loadMoreFailedRewardClaims = (campaignId: string) => {
    if (campaignId !== failedRewardCampaignId || failedRewardClaimsLoading) return;
    void loadFailedRewardClaims(campaignId, failedRewardClaims.length, true);
  };

  const openVipCampaigns = () => {
    setShowAdminMenu(false);
    setShowVipPeriods(false);
    setShowRolesModal(false);
    setVipCampaigns([]);
    setVipCampaignsHasMore(false);
    setVipCampaignsNotice('');
    setFailedRewardCampaignId(null);
    setFailedRewardClaims([]);
    setFailedRewardClaimsHasMore(false);
    setFailedRewardClaimsError('');
    crossCampaignFailedRewardRequestRef.current += 1;
    setCrossCampaignFailedRewardSearch('');
    setCrossCampaignFailedRewardSourceBot('all');
    setCrossCampaignFailedRewardActiveSearch('');
    setCrossCampaignFailedRewardActiveSourceBot('all');
    setCrossCampaignFailedRewardSearched(false);
    setCrossCampaignFailedRewardClaims([]);
    setCrossCampaignFailedRewardClaimsHasMore(false);
    setCrossCampaignFailedRewardClaimsLoading(false);
    setCrossCampaignFailedRewardClaimsError('');
    vipRetryAuditRequestRef.current += 1;
    setRetryAuditCampaignId(null);
    setRetryAuditRecords([]);
    setRetryAuditHasMore(false);
    setRetryAuditLoading(false);
    setRetryAuditError('');
    setVipFailureAlert(null);
    setVipFailureAlertError('');
    setVipRewardQueueHealth(null);
    setVipRewardQueueHealthLoading(false);
    setVipRewardQueueHealthError('');
    setShowVipCampaignsModal(true);
    void loadVipCampaigns(0, false);
    void loadNewVipFailureAlerts();
    void loadVipRewardQueueHealth();
  };

  const handleStopVipCampaign = async (campaignId: string) => {
    const campaign = vipCampaigns.find((item) => item.id === campaignId);
    if (!campaign?.isActive || stoppingVipCampaignId === campaignId) return;
    if (!window.confirm(vipGrantCopy[lang].campaignStopConfirm)) return;

    setStoppingVipCampaignId(campaignId);
    setVipCampaignsError('');
    setVipCampaignsNotice('');
    try {
      const result = await workerPost('/api/vip-campaigns', {
        action: 'deactivate',
        campaignId,
      });
      if (result?.ok !== true || result.campaignId !== campaignId ||
          result.isActive !== false || result.awardsPreserved !== true) {
        throw new Error(vipGrantCopy[lang].campaignStopFailed);
      }
      setVipCampaigns((current) => current.map((item) =>
        item.id === campaignId ? { ...item, isActive: false } : item
      ));
      setVipCampaignsNotice(vipGrantCopy[lang].campaignStoppedNotice);
    } catch (error) {
      console.error('Could not stop VIP campaign:', error);
      setVipCampaignsError(formatAdminFailure(error, vipGrantCopy[lang].campaignStopFailed));
    } finally {
      setStoppingVipCampaignId(null);
    }
  };

  const handleAcknowledgeVipGrant = async () => {
    const notice = vipGrantNotice;
    if (!notice?.claimIds.length || vipGrantAcknowledgementLockRef.current) return;
    vipGrantAcknowledgementLockRef.current = true;
    setVipGrantAcknowledging(true);
    setVipGrantAcknowledgementError('');
    try {
      await workerPost('/api/vip-grants/ack', { claimIds: notice.claimIds });
      setVipGrantNotice(null);
    } catch (error) {
      console.error('VIP reward acknowledgement failed:', error);
      setVipGrantAcknowledgementError(vipGrantCopy[lang].popupAckFailed);
    } finally {
      vipGrantAcknowledgementLockRef.current = false;
      setVipGrantAcknowledging(false);
    }
  };

  const handleSaveFlyingPrice = async () => {
    const price = Number(flyingPriceDraft);
    if (!Number.isSafeInteger(price) || price < 0 || price > 10_000) {
      showFlyingMessageNotice('Price must be between 0 and 10000 Stars.');
      return;
    }
    setSavingFlyingPrice(true);
    try {
      const result = await workerPost('/api/admin/flying-message-price', { starsPrice: price });
      setFlyingMessagePrice(result.starsPrice);
      setFlyingPriceDraft(String(result.starsPrice));
      setShowFlyingPriceEditor(false);
      setShowAdminMenu(false);
      showFlyingMessageNotice('');
    } catch (error) {
      showFlyingMessageNotice(formatAdminFailure(error, 'Price could not be saved.'));
    } finally {
      setSavingFlyingPrice(false);
    }
  };

  const handleResetAll = async () => {
    const copy = adminProfileActionCopy[lang];
    if (!window.confirm(copy.resetAllConfirm)) return;
    try {
      await workerPost('/api/reset-all');
      setShowAdminMenu(false);
      alert(copy.resetAllDone);
    } catch (e) { console.error(e); alert(formatAdminFailure(e, t('resetFailed'))); }
  };

  const filterSubStatusInfo = (() => {
    if (filterSubscriptionActive) return { label: t('subscribedUntil').replace('{d}', new Date(filterSubUntil).toLocaleDateString()), color: '#4ade80' };
    if (filterSubUntil > 0) return { label: t('expired'), color: '#e11d48' };
    if (!paidUnlocked) return { label: t('unsubscribed'), color: '#888' };
    return { label: t('expired'), color: '#e11d48' };
  })();
  const paidFeatureNoticeCopy = PAID_FEATURE_NOTICE_COPY[lang];
  const hideAgeNoticeDate = hideAgeExpiry && Date.parse(hideAgeExpiry) > Date.now()
    ? new Date(hideAgeExpiry).toLocaleDateString()
    : null;
  const invisibleNoticeDate = invisibleExpiry && Date.parse(invisibleExpiry) > Date.now()
    ? new Date(invisibleExpiry).toLocaleDateString()
    : null;
  const hideAgeNoticeMessage = hideAgeNotice === 'ended'
    ? paidFeatureNoticeCopy.hideAgeEnded
    : hideAgeNoticeDate
      ? paidFeatureNoticeCopy.hideAgeActive.replace('{date}', hideAgeNoticeDate)
      : paidFeatureNoticeCopy.hideAgeActiveNoExpiry;
  const invisibleNoticeMessage = invisibleNotice === 'ended'
    ? paidFeatureNoticeCopy.invisibleEnded
    : invisibleNoticeDate
      ? paidFeatureNoticeCopy.invisibleActive.replace('{date}', invisibleNoticeDate)
      : paidFeatureNoticeCopy.invisibleActiveNoExpiry;

  const isViewingSelf = selectedProfile ? (currentUser && selectedProfile.id === currentUser.id) : false;
  const activeProfile = selectedProfile;
  const genderEligibleUsers = users.filter(passesMandatoryGenderAccess);
  const gridFilteredUsers = gridFilterEnabled
    ? filterProfilesByMatchVisibility(genderEligibleUsers, hideNonMatchingUsers, checkFilterPass)
    : [];
  // Self is excluded from the shared list; your own pin is rendered separately
  // at your live GPS location and is visible ONLY to you (greyed out only when
  // actually invisible, i.e. grid toggle off - NOT when the map toggle is off).
  const mapCandidates = users.filter((user) =>
    user.id !== currentUser?.id &&
    passesMandatoryGenderAccess(user) &&
    resolveMapVisibility(user.map_visible, user.grid_visible, user.invisible_expiry)
  );
  const mapFilteredUsers = gridFilterEnabled
    ? filterProfilesByMatchVisibility(mapCandidates, hideNonMatchingUsers, checkFilterPass)
    : mapCandidates;
  const hasDiscoveryModule = gridFilterEnabled || mapModuleEnabled;
  const discoveryUserCount = gridFilterEnabled ? gridFilteredUsers.length : mapFilteredUsers.length;
  const currentUserIsM2M = currentUser?.gender === 'man' && currentUser?.seeking === 'men';
  const targetIsManSeekingMan = activeProfile?.gender === 'man' && activeProfile?.seeking === 'men';
  const passesFilterForActive = activeProfile ? checkFilterPass(activeProfile) : true;
  const profileInterestCopy = PROFILE_INTEREST_COPY[lang];
  const activeInterestCooldownUntil = activeProfile?.interest_cooldown_until
    ? Date.parse(activeProfile.interest_cooldown_until)
    : NaN;
  const activeInterestCoolingDown = Number.isFinite(activeInterestCooldownUntil) &&
    activeInterestCooldownUntil > raffleClock;
  const activeInterestFeedbackMessage = activeProfile && interestFeedback?.profileId === activeProfile.id
    ? profileInterestCopy[interestFeedback.state]
    : '';
  const activeInterestStatusMessage = activeInterestFeedbackMessage ||
    (activeProfile?.interest_state_known !== true
      ? profileInterestCopy.unavailable
      : activeInterestCoolingDown
        ? profileInterestCopy.cooldown
        : '');
  const flyingMessageWaitSeconds = Math.max(0, Math.ceil((flyingCooldownUntil - cooldownClock) / 1000));
  const flyingCopy = flyingMessageCopy[lang];
  const raffleCopy = raffleUiCopy[lang];
  const raffleDeadline = raffleState?.closesAt && Number.isFinite(Date.parse(raffleState.closesAt))
    ? Date.parse(raffleState.closesAt)
    : getNextRaffleCloseAt(raffleClock);
  const raffleCountdown = formatRaffleCountdown(raffleDeadline, raffleClock, lang);
  const flyingComposerStatus = flyingMessageNotice || (
    flyingMessageWaitSeconds > 0
      ? flyingCopy.cooldown.replace('{seconds}', String(flyingMessageWaitSeconds))
      : ''
  );
  const activePaymentMarker = pendingAccessRecheck &&
    pendingAccessRecheck.accountId === currentUser?.id
      ? pendingAccessRecheck
      : null;
  const paymentCheckPending = currentUser?.id
    ? hasPendingPaymentVerification(currentUser.id)
    : false;
  const paymentRecheckPhase = getPendingAccessRecheckPhase(
    activePaymentMarker,
    currentUser?.id,
    Date.now(),
  );
  const paymentRetryAvailable = paymentRecheckPhase === 'retry';
  const paymentRecheckMessage = activePaymentMarker && paymentRecheckPhase
    ? PAYMENT_RECHECK_COPY[lang][paymentRetryAvailable ? 'pending' : 'checking'].replace(
      '{entitlement}',
      PAYMENT_RECHECK_ENTITLEMENT_COPY[lang][activePaymentMarker.entitlement],
    )
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#121212', color: '#ffffff', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {(showProfileSetup || showProfileEditModal) && (
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#121212',
                color: '#fff',
              }}
            >
              {t('loading')}
            </div>
          }
        >
          <ProfileCompletionModule
          entry={entry}
          isCompletionFlow={showProfileSetup && !showProfileEditModal}
          language={lang}
          missingFields={profileCompletionMissingFields}
          values={{
            dob,
            gender,
            seeking,
            height,
            weight,
            rolePref,
            safetyPref,
            playstylePref,
            howManyPref,
            wherePref,
            nonManMode,
          }}
          onChange={{
            dob: setDob,
            gender: setGender,
            seeking: setSeeking,
            height: setHeight,
            weight: setWeight,
            rolePref: setRolePref,
            safetyPref: setSafetyPref,
            playstylePref: setPlaystylePref,
            howManyPref: setHowManyPref,
            wherePref: setWherePref,
            nonManMode: setNonManMode,
          }}
          onSubmit={handleSaveInitialProfile}
          onClose={() => setShowProfileEditModal(false)}
          showCloseButton={showProfileEditModal}
          errorMessage={errorMessage}
          heightOptions={heightOptions}
          weightOptions={weightOptions}
          t={t}
          onCycleRole={() => {
            const nextValue = cycleNext(rolePref, PROFILE_ROLE_CYCLE_OPTIONS);
            setRolePref(nextValue);
            return nextValue;
          }}
          onCycleSafety={() => {
            const nextValue = cycleNext(safetyPref, PROFILE_SAFETY_CYCLE_OPTIONS);
            setSafetyPref(nextValue);
            return nextValue;
          }}
          onCyclePlaystyle={() => {
            const nextValue = cycleNext(playstylePref, PROFILE_PLAYSTYLE_CYCLE_OPTIONS);
            setPlaystylePref(nextValue);
            return nextValue;
          }}
          onCycleHowMany={() => {
            const nextValue = cycleNext(howManyPref, PROFILE_HOW_MANY_CYCLE_OPTIONS);
            setHowManyPref(nextValue);
            return nextValue;
          }}
          onCycleWhere={() => {
            const nextValue = cycleWhere(wherePref, PROFILE_WHERE_CYCLE_OPTIONS);
            setWherePref(nextValue);
            return nextValue;
          }}
          />
        </Suspense>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: '60px', minHeight: '60px', backgroundColor: '#1e1e1e', borderBottom: '1px solid #333', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>
            {entry.useConfiguredLabelForHeader ? entry.label : t('whosNearby')}
            {hasDiscoveryModule ? ` (${discoveryUserCount})` : ''}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          {gridFilterEnabled && (
            <button
              type="button"
              aria-label={SCREEN_HELP_COPY[lang].open}
              data-testid="button-screen-help"
              title={SCREEN_HELP_COPY[lang].open}
              onClick={() => {
                setShowFilterDropdown(false);
                setShowScreenHelp(true);
              }}
              style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, lineHeight: 1 }}
            >
              <span aria-hidden="true">?</span>
            </button>
          )}
          {gridFilterEnabled && (
            <GridFilterModule
              open={showFilterDropdown}
              title={t('filter')}
              onToggle={handleToggleFilterDropdown}
            >
            <div style={{ position: 'absolute', top: '44px', right: '0', zIndex: 2000, backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', padding: '12px', width: '280px', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{t('filterUsers')}<span style={{ fontSize: '11px', fontWeight: 'normal', color: isAdmin ? '#4ade80' : isVip || temporaryVipActive ? '#f5c518' : globalVipActive ? '#f5c518' : filterSubStatusInfo.color }}>{isAdmin ? t('admin') : isVip ? t('vipUnlimited') : temporaryVipActive ? `${t('vip')} · ${t('expires')} ${new Date(vipExpiry as string).toLocaleDateString()}` : globalVipActive ? `${t('vip')} · ${t('expires')} ${new Date(globalVipUntil).toLocaleDateString()}` : `${filterSubStatusInfo.label}${filterSubscriptionActive ? ` · ${t('expires')} ${new Date(filterSubUntil).toLocaleDateString()}` : ''}`}</span></div>
               {hkmoMenOnlyFilterLocked && (
                 <div
                   role="note"
                   data-testid="hkmo-men-only-filter-lock"
                   style={{
                     borderTop: '1px solid #333',
                     paddingTop: '8px',
                     color: '#93c5fd',
                     fontSize: '11px',
                     lineHeight: 1.4,
                   }}
                 >
                   {FILTER_UI_COPY[lang].hkmoMenOnly}
                 </div>
               )}
              {canUseHideNonMatching && (
                <div style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleToggleFilterItem('hideNonMatching')}>
                    <input type="checkbox" checked={hideNonMatchingUsers} readOnly style={{ width: '16px', height: '16px', accentColor: '#007bff', cursor: 'pointer' }} />
                    <span style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>{FILTER_UI_COPY[lang].hideNonMatching}</span>
                  </div>
                </div>
              )}
              {filterAccessActive ? (
                <>
              <div role="group" aria-label={hkmoMenOnlyFilterLocked ? FILTER_UI_COPY[lang].hkmoMenOnly : `${t('men')} / ${t('women')}`} style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['man', 'woman'] as const).map((genderValue) => {
                    const selected = effectiveFilterGenderVals.includes(genderValue);
                    return (
                      <button
                        key={genderValue}
                        type="button"
                        data-testid={`button-filter-gender-${genderValue}`}
                        disabled={hkmoMenOnlyFilterLocked}
                        aria-pressed={selected}
                        onClick={() => { void handleToggleFilterGender(genderValue); }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '8px 4px',
                          backgroundColor: selected ? '#2563eb' : '#2a2a2a',
                          color: '#fff',
                          border: selected ? '1px solid #2563eb' : '1px solid #444',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: hkmoMenOnlyFilterLocked ? 'not-allowed' : 'pointer',
                          opacity: selected ? 1 : hkmoMenOnlyFilterLocked ? 0.5 : 0.72,
                        }}
                      >
                        {genderValue === 'man' ? t('men') : t('women')}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleToggleFilterItem('age')}>
                  <input type="checkbox" checked={filterAgeOn} onChange={() => {}} style={{ width: '16px', height: '16px', accentColor: '#007bff', cursor: 'pointer' }} />
                  <span style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>{t('ageRange')}</span>
                </div>
                {filterAgeOn && (<div style={{ marginTop: '8px', padding: '0 4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#aaa', marginBottom: '2px' }}><span>{filterAgeMin}</span><span>{filterAgeMax}</span></div>
                  <input type="range" min={18} max={80} value={filterAgeMin} onChange={(e) => { const v = Number(e.target.value); if (v <= filterAgeMax) handleAgeRangeChange(v, filterAgeMax); }} style={{ width: '100%', accentColor: '#007bff' }} />
                  <input type="range" min={18} max={80} value={filterAgeMax} onChange={(e) => { const v = Number(e.target.value); if (v >= filterAgeMin) handleAgeRangeChange(filterAgeMin, v); }} style={{ width: '100%', accentColor: '#007bff', marginTop: '-8px' }} />
                </div>)}
              </div>
              <div style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleToggleFilterItem('height')}>
                  <input type="checkbox" checked={filterHeightOn} onChange={() => {}} style={{ width: '16px', height: '16px', accentColor: '#007bff', cursor: 'pointer' }} />
                  <span style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>{t('height')}</span>
                </div>
                {filterHeightOn && (<div style={{ marginTop: '8px', padding: '0 4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#aaa', marginBottom: '2px' }}><span>{filterHeightMin / 100}m</span><span>{filterHeightMax / 100}m</span></div>
                  <input type="range" min={140} max={220} step={1} value={filterHeightMin} onChange={(e) => { const v = Number(e.target.value); if (v <= filterHeightMax) handleHeightRangeChange(v, filterHeightMax); }} style={{ width: '100%', accentColor: '#007bff' }} />
                  <input type="range" min={140} max={220} step={1} value={filterHeightMax} onChange={(e) => { const v = Number(e.target.value); if (v >= filterHeightMin) handleHeightRangeChange(filterHeightMin, v); }} style={{ width: '100%', accentColor: '#007bff', marginTop: '-8px' }} />
                </div>)}
              </div>
              {currentUserIsM2M && (<div data-testid="filter-m2m-preference-matcher" style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleToggleFilterItem('prefMatcher')}>
                  <input type="checkbox" checked={filterPrefMatcherOn} onChange={() => {}} style={{ width: '16px', height: '16px', accentColor: '#007bff', cursor: 'pointer' }} />
                  <span style={{ fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>{t('preferenceMatcher')}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', paddingLeft: '24px' }}>{t('m2m')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px', paddingLeft: '24px' }}>
                  <button type="button" onClick={() => handleToggleFilterValue('role')} style={{ flex: '1 1 40%', minWidth: '90px', padding: '8px 4px', backgroundColor: filterRoleVal ? '#e11d48' : '#2a2a2a', color: '#fff', border: filterRoleVal ? '1px solid #e11d48' : '1px solid #444', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', opacity: filterRoleVal ? 1 : 0.45, filter: filterRoleVal ? 'none' : 'grayscale(100%)' }}>{filterRoleVal === 'Off' ? FILTER_CYCLE_COPY[lang].roleOff : filterRoleVal ? formatTagText(t(filterRoleVal)) : t('Off')}</button>
                  <button type="button" onClick={() => handleToggleFilterValue('safety')} style={{ flex: '1 1 40%', minWidth: '90px', padding: '8px 4px', backgroundColor: filterSafetyVal && filterSafetyVal !== 'Off' ? '#2563eb' : '#2a2a2a', color: '#fff', border: filterSafetyVal && filterSafetyVal !== 'Off' ? '1px solid #2563eb' : '1px solid #444', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', opacity: filterSafetyVal && filterSafetyVal !== 'Off' ? 1 : 0.45, filter: filterSafetyVal && filterSafetyVal !== 'Off' ? 'none' : 'grayscale(100%)' }}>{filterSafetyVal && filterSafetyVal !== 'Off' ? formatTagText(t(filterSafetyVal)) : FILTER_CYCLE_COPY[lang].depends}</button>
                  <button type="button" onClick={() => handleToggleFilterValue('playstyle')} style={{ flex: '1 1 40%', minWidth: '90px', padding: '8px 4px', backgroundColor: filterPlaystyleVal && filterPlaystyleVal !== 'Off' ? '#16a34a' : '#2a2a2a', color: '#fff', border: filterPlaystyleVal && filterPlaystyleVal !== 'Off' ? '1px solid #16a34a' : '1px solid #444', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', opacity: filterPlaystyleVal && filterPlaystyleVal !== 'Off' ? 1 : 0.45, filter: filterPlaystyleVal && filterPlaystyleVal !== 'Off' ? 'none' : 'grayscale(100%)' }}>{filterPlaystyleVal === 'Party✓' ? FILTER_CYCLE_COPY[lang].partyWithStuff : filterPlaystyleVal && filterPlaystyleVal !== 'Off' ? formatTagText(t(filterPlaystyleVal)) : FILTER_CYCLE_COPY[lang].depends}</button>
                  <button
                    type="button"
                    title={t('How Many')}
                    aria-label={`${t('How Many')}: ${
                      filterHowManyVal === '1on1'
                        ? t('1on1')
                        : filterHowManyVal === 'group'
                          ? (HOW_MANY_GROUP_LABELS[lang] ?? 'Groups')
                          : t('DoesntMatter')
                    }`}
                    aria-pressed={filterHowManyVal !== DEFAULT_HOW_MANY_FILTER}
                    onClick={() => handleToggleFilterValue('howMany')}
                    style={{
                      flex: '1 1 40%',
                      minWidth: '90px',
                      padding: '8px 4px',
                      backgroundColor: filterHowManyVal === DEFAULT_HOW_MANY_FILTER ? '#2a2a2a' : '#9333ea',
                      color: '#fff',
                      border: filterHowManyVal === DEFAULT_HOW_MANY_FILTER ? '1px solid #444' : '1px solid #9333ea',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      opacity: filterHowManyVal === DEFAULT_HOW_MANY_FILTER ? 0.75 : 1,
                      cursor: 'pointer',
                    }}
                  >
                    {filterHowManyVal === '1on1'
                      ? formatTagText(t('1on1'))
                      : filterHowManyVal === 'group'
                        ? (HOW_MANY_GROUP_LABELS[lang] ?? 'Groups')
                        : t('DoesntMatter')}
                  </button>
                  <button type="button" onClick={() => handleToggleFilterValue('where')} style={{ flex: '1 1 40%', minWidth: '90px', padding: '8px 4px', backgroundColor: filterWhereVal && filterWhereVal !== 'Off' ? '#d97706' : '#2a2a2a', color: '#fff', border: filterWhereVal && filterWhereVal !== 'Off' ? '1px solid #d97706' : '1px solid #444', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', opacity: filterWhereVal && filterWhereVal !== 'Off' ? 1 : 0.45, filter: filterWhereVal && filterWhereVal !== 'Off' ? 'none' : 'grayscale(100%)' }}>{filterWhereVal && filterWhereVal !== 'Off' ? formatTagText(t(filterWhereVal)) : t('Anywhere')}</button>
                </div>
              </div>)}
              {filterSubscriptionActive && (
                <div style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>
                    {FILTER_UI_COPY[lang].filterSubscriptionExpires} {new Date(filterSubUntil).toLocaleDateString()}
                  </div>
                  <button
                    type="button"
                    disabled={isFilterAccessRenewing || paymentCheckPending}
                    aria-busy={isFilterAccessRenewing || paymentCheckPending}
                    onClick={() => { void handleRenewFilterAccess('active_filter_subscription', true); }}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #2563eb',
                      borderRadius: '6px',
                      background: '#1d4ed8',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: isFilterAccessRenewing || paymentCheckPending ? 'wait' : 'pointer',
                      opacity: isFilterAccessRenewing || paymentCheckPending ? 0.7 : 1,
                    }}
                  >
                    {isFilterAccessRenewing
                      ? FILTER_UI_COPY[lang].renewingAccess
                      : paymentCheckPending
                        ? FILTER_UI_COPY[lang].renewalPending
                        : FILTER_UI_COPY[lang].renewEarly}
                  </button>
                </div>
              )}
                </>
              ) : (
                <div style={{ borderTop: '1px solid #333', paddingTop: '10px' }}>
                  <div style={{ color: '#bbb', fontSize: '12px', lineHeight: '1.45', marginBottom: '10px' }}>{FILTER_UI_COPY[lang].accessRequired}</div>
                  <button type="button" onClick={() => { void handleRenewFilterAccess('filter_access_prompt'); }} style={{ width: '100%', padding: '9px 10px', border: '1px solid #2563eb', borderRadius: '6px', background: '#1d4ed8', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>{FILTER_UI_COPY[lang].renewAccess}</button>
                </div>
              )}
            </div>
            </GridFilterModule>
          )}
          {hasDiscoveryModule && (
            <button onClick={handleRefresh} style={{ width: '36px', height: '36px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('refresh')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
            </button>
          )}
        </div>
      </header>

      {showScreenHelp && (
        <ScreenHelpOverlay
          lang={lang}
          view={view}
          viewLabel={t(view)}
          filterEnabled={gridFilterEnabled}
          discoveryEnabled={hasDiscoveryModule}
          starRaffleEnabled={starRaffleEnabled}
          flyingMessageEnabled={flyingMessageEnabled}
          onClose={() => setShowScreenHelp(false)}
        />
      )}

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {gridFilterEnabled && (
          <div style={{ display: view === 'grid' ? 'block' : 'none', height: '100%', flex: 1 }}>
            <NearbyGridModule
              users={gridFilteredUsers}
              currentUserId={currentUser?.id || null}
              isOnline={isOnlineWithin15Min}
              passesFilter={checkFilterPass}
              formatDistance={formatDistanceBigUnit}
              onSelectProfile={handleCardClick}
              t={t}
              interestLabel={profileInterestCopy.received}
            />
          </div>
        )}

        {mapModuleEnabled && (
          <div style={{ display: view === 'map' ? 'block' : 'none', height: '100%', width: '100%', position: 'relative', flex: 1, zIndex: 1 }}>
            {!hasMainProfileImage ? (
              <div
                role="status"
                data-testid="map-photo-required"
                style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#fff', textAlign: 'center', lineHeight: 1.5, boxSizing: 'border-box' }}
              >
                <p style={{ maxWidth: '360px' }}>{MAP_PROFILE_PHOTO_REQUIRED_COPY[lang]}</p>
              </div>
            ) : (hasOpenedMap || !gridFilterEnabled) && (
            <Suspense fallback={<div role="status" style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>{t('map')}</div>}>
              <MapView
                location={location}
                isVisible={view === 'map'}
                currentUser={currentUser}
                users={mapFilteredUsers}
                gridVisible={gridVisible}
                isOnline={isOnlineWithin15Min}
                onSelectProfile={handleCardClick}
              />
            </Suspense>
          )}
          </div>
        )}

        {!hasDiscoveryModule && (
          <div role="status" style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#aaa', textAlign: 'center', lineHeight: 1.5 }}>
            {NO_DISCOVERY_MODULES_COPY[lang]}
          </div>
        )}
      </main>

      {activeProfile && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedProfile(null);
          }}
        >
          <div style={{ position: 'relative', backgroundColor: '#1e1e1e', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '24px 20px 40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {!isViewingSelf && (
              <div style={{ position: 'absolute', top: '14px', right: '14px', zIndex: 5, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowNoteBox((v) => !v); }} style={{ padding: '2px 8px', backgroundColor: noteDraft ? '#b45309' : '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }} title={t('privateNote')}>📝</button>
                {isAdmin && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleForceReset(); }} style={{ padding: '2px 8px', backgroundColor: '#7f1d1d', border: '1px solid #444', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }} title={t('forceReset')} aria-label={t('forceReset')}>🔁</button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleForceSwapSex(); }}
                      disabled={activeProfile.gender !== 'man' && activeProfile.gender !== 'woman'}
                      data-testid="admin-force-swap-sex"
                      style={{ padding: '4px 6px', backgroundColor: '#7c2d12', border: '1px solid #9a3412', borderRadius: '6px', color: '#fff', fontSize: '10px', whiteSpace: 'nowrap', cursor: activeProfile.gender === 'man' || activeProfile.gender === 'woman' ? 'pointer' : 'not-allowed', opacity: activeProfile.gender === 'man' || activeProfile.gender === 'woman' ? 1 : 0.55 }}
                      title={activeProfile.gender === 'man' || activeProfile.gender === 'woman' ? adminProfileActionCopy[lang].swapSexButton : adminProfileActionCopy[lang].swapSexUnavailable}
                      aria-label={adminProfileActionCopy[lang].swapSexButton}
                    >
                      {adminProfileActionCopy[lang].swapSexButton}
                    </button>
                  </div>
                )}
              </div>
            )}
            {isViewingSelf && (
              <div style={{ position: 'absolute', top: '14px', right: '14px', zIndex: 5, display: 'flex', gap: '6px' }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleResetProfile(); }} style={{ padding: '2px 8px', backgroundColor: '#1d4ed8', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', color: '#fff', cursor: 'pointer' }} title={t('resetProfile')}>{t('resetProfile')}</button>
              </div>
            )}
            {isViewingSelf && isAdmin && (
              <div style={{ position: 'absolute', top: '14px', left: '14px', zIndex: 6 }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowAdminMenu((v) => !v); }} style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4b5563', border: '1px solid #6b7280', borderRadius: '6px', fontSize: '16px', color: '#fff', cursor: 'pointer', lineHeight: 1 }} title={t('adminMenu')} aria-label={t('adminMenu')}>⚙</button>
                {showAdminMenu && (
                  <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '34px', left: 0, backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', padding: '6px', minWidth: '210px', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button type="button" onClick={() => { setShowAdminMenu(false); setShowVipPeriods(false); setShowRolesModal(true); loadRoles(); }} style={{ padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>{t('adminVipList')}</button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminMenu(false);
                        setShowProfileSetupPreview(true);
                      }}
                      data-testid="button-open-profile-setup-preview"
                      style={{ padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {t('profileSetupPreview')}
                    </button>
                    <button
                      type="button"
                      onClick={openPaymentReview}
                      data-testid="button-open-payment-review"
                      style={{ padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {paymentReviewCopy[lang].title}
                    </button>
                    <button type="button" onClick={openVipCampaigns} style={{ padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>{vipGrantCopy[lang].campaignsTitle}</button>
                    {flyingMessageEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          setFlyingPriceDraft(String(flyingMessagePrice));
                          setShowFlyingPriceEditor((value) => !value);
                        }}
                        style={{ padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}
                      >
                        {flyingCopy.priceLabel} · {flyingMessagePrice} ⭐
                      </button>
                    )}
                    {flyingMessageEnabled && showFlyingPriceEditor && (
                      <form
                        onSubmit={(event) => { event.preventDefault(); void handleSaveFlyingPrice(); }}
                        style={{ display: 'flex', gap: '5px', padding: '2px 0 4px' }}
                      >
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          step={1}
                          value={flyingPriceDraft}
                          onChange={(event) => setFlyingPriceDraft(event.target.value)}
                          aria-label={flyingCopy.priceLabel}
                          style={{ flex: 1, minWidth: 0, padding: '7px', backgroundColor: '#121212', color: '#fff', border: '1px solid #555', borderRadius: '5px', fontSize: '12px' }}
                        />
                        <button
                          type="submit"
                          disabled={savingFlyingPrice}
                          style={{ padding: '7px 9px', backgroundColor: '#166534', border: '1px solid #15803d', borderRadius: '5px', color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: savingFlyingPrice ? 'wait' : 'pointer' }}
                        >
                          {savingFlyingPrice ? flyingCopy.sending : flyingCopy.save}
                        </button>
                      </form>
                    )}
                    <button type="button" onClick={() => setShowVipPeriods((v) => !v)} style={{ padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', fontSize: '13px', color: '#fff', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}><span>{t('grantVipAll')}</span><span style={{ color: '#f5c518', fontSize: '11px' }}>{showVipPeriods ? '▾' : '▸'}</span></button>
                    {globalVipActive && (<div style={{ fontSize: '10px', color: '#f5c518', padding: '0 4px' }}>{t('vip')} · {t('expires')} {new Date(globalVipUntil).toLocaleDateString()}</div>)}
                    {showVipPeriods && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 0 4px 10px', borderLeft: '2px solid #f5c518', marginLeft: '2px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', color: '#eee', fontSize: '12px', lineHeight: '1.35' }}>
                            <input
                              type="checkbox"
                              checked={vipGrantWindowEnabled}
                              onChange={(event) => {
                                setVipGrantWindowEnabled(event.target.checked);
                                if (!event.target.checked) setAllowNewVipUsers(false);
                              }}
                            />
                            <span>{vipGrantCopy[lang].trigger}</span>
                          </label>
                          <select
                            value={vipGrantWindow}
                            disabled={!vipGrantWindowEnabled || savingVipGrant}
                            onChange={(event) => setVipGrantWindow(event.target.value as VipGrantWindow)}
                            aria-label={vipGrantCopy[lang].trigger}
                            style={{ padding: '7px 9px', backgroundColor: '#121212', border: '1px solid #555', borderRadius: '5px', color: vipGrantWindowEnabled ? '#fff' : '#888', fontSize: '12px' }}
                          >
                            <option value="1_day">{t('period_1d')}</option>
                            <option value="3_days">{t('period_3d')}</option>
                            <option value="today">{vipGrantCopy[lang].today}</option>
                            <option value="week">{vipGrantCopy[lang].week}</option>
                            <option value="month">{vipGrantCopy[lang].month}</option>
                          </select>
                          <span style={{ fontSize: '10px', color: '#999' }}>{vipGrantCopy[lang].hongKongTime}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', color: '#eee', fontSize: '12px', lineHeight: '1.35' }}>
                            <input
                              type="checkbox"
                              checked={randomVipDaysEnabled}
                              disabled={savingVipGrant}
                              onChange={(event) => setRandomVipDaysEnabled(event.target.checked)}
                            />
                            <span>{vipGrantCopy[lang].random}</span>
                          </label>
                          <span style={{ paddingLeft: '22px', fontSize: '10px', color: '#999' }}>{vipGrantCopy[lang].randomHint}</span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', color: vipGrantWindowEnabled ? '#eee' : '#777', fontSize: '12px', lineHeight: '1.35' }}>
                          <input
                            type="checkbox"
                            checked={allowNewVipUsers}
                            disabled={!vipGrantWindowEnabled || savingVipGrant}
                            onChange={(event) => setAllowNewVipUsers(event.target.checked)}
                          />
                          <span>{vipGrantCopy[lang].allowNewUsers}</span>
                        </label>
                        {([['1d', 1 * 864e5], ['3d', 3 * 864e5], ['1w', 7 * 864e5], ['1mo', 30 * 864e5], ['3mo', 90 * 864e5], ['6mo', 180 * 864e5], ['1y', 365 * 864e5]] as [string, number][]).map(([key, ms]) => (
                          <button key={key} type="button" disabled={savingVipGrant} onClick={() => handleGrantGlobalVip(ms)} style={{ padding: '7px 10px', backgroundColor: '#3a2f00', border: '1px solid #665500', borderRadius: '6px', fontSize: '12px', color: '#f5c518', cursor: savingVipGrant ? 'wait' : 'pointer', textAlign: 'left', opacity: savingVipGrant ? 0.65 : 1 }}>{savingVipGrant ? `${t(`period_${key}`)}…` : t(`period_${key}`)}</button>
                        ))}
                        {globalVipActive && (<button type="button" disabled={savingVipGrant} onClick={() => handleGrantGlobalVip(0)} style={{ padding: '7px 10px', backgroundColor: '#3a1010', border: '1px solid #663333', borderRadius: '6px', fontSize: '12px', color: '#f87171', cursor: savingVipGrant ? 'wait' : 'pointer', textAlign: 'left' }}>{t('revokeVipAll')}</button>)}
                      </div>
                    )}
                    <button type="button" onClick={handleResetAll} style={{ padding: '9px 10px', backgroundColor: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '6px', fontSize: '13px', color: '#fff', cursor: 'pointer', textAlign: 'left' }}>{t('forceResetAll')}</button>
                  </div>
                )}
              </div>
            )}
            <div style={{ width: '40px', height: '4px', backgroundColor: '#444', borderRadius: '2px', marginBottom: '16px' }} />
            <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '90px', height: '90px', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#222', border: '3px solid #007bff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', filter: passesFilterForActive ? 'none' : 'grayscale(100%)' }}>
                {activeProfile.avatar ? (<img src={activeProfile.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : (<span style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{activeProfile.name ? activeProfile.name.charAt(0).toUpperCase() : 'U'}</span>)}
              </div>
              <h2 style={{ fontSize: '20px', marginBottom: '6px', color: '#ffffff', fontWeight: 'bold' }}>{activeProfile.name}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', fontSize: '13px', color: '#ccc', marginBottom: '16px', alignItems: 'center' }}>
                {!activeProfile.hide_age && (typeof activeProfile.age === 'number' ? activeProfile.age : calculateAge(activeProfile.dob)) && <span>{typeof activeProfile.age === 'number' ? activeProfile.age : calculateAge(activeProfile.dob)}</span>}
                {activeProfile.zodiac || getZodiacSignEmoji(activeProfile.dob)}<span>&bull;</span><span>{activeProfile.height}</span><span>&bull;</span><span>{activeProfile.weight}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', fontSize: '13px', color: '#ccc', marginBottom: '16px', alignItems: 'center' }}>
                {isViewingSelf ? <span>&nbsp;</span> : <><span>{formatDistanceBigUnit(activeProfile.distance)} {t('away')}</span><span>&bull;</span></>}<span style={{ color: '#4ade80' }}>{renderLastSeenBigUnit(formatLastSeenBigUnit(activeProfile.last_seen), t)}</span>
              </div>
              {isViewingSelf && (<div style={{ display: 'flex', width: '100%', justifyContent: 'center', marginBottom: '14px', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <button type="button" onClick={handleHideAgeToggle} style={{ padding: '8px 16px', backgroundColor: hideAge ? '#e11d48' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{hideAge ? t('ageHidden') : t('ageShown')}</button>
                {hideAgeExpiry && <span style={{ fontSize: '10px', color: '#888' }}>{t('expires')} {new Date(hideAgeExpiry).toLocaleDateString()}</span>}
                {!paidUnlocked && isPaidEntitlementActive({ hide_age: hideAge, hide_age_expiry: hideAgeExpiry }, 'hideAge', raffleClock) && (
                  <button
                    type="button"
                    onClick={() => { void handleRenewHideAge(true); }}
                    disabled={isHideAgeRenewing || paymentCheckPending}
                    aria-busy={isHideAgeRenewing || paymentCheckPending}
                    style={{ width: '100%', maxWidth: '260px', padding: '7px 10px', border: '1px solid #60a5fa', borderRadius: '6px', backgroundColor: isHideAgeRenewing || paymentCheckPending ? '#374151' : '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: isHideAgeRenewing || paymentCheckPending ? 'wait' : 'pointer', opacity: isHideAgeRenewing || paymentCheckPending ? 0.75 : 1 }}
                  >
                    {isHideAgeRenewing ? paidFeatureNoticeCopy.renewing : paidFeatureNoticeCopy.renewHideAge}
                  </button>
                )}
                {isPaidEntitlementActive({ grid_visible: gridVisible, invisible_expiry: invisibleExpiry }, 'invisible', raffleClock) && (
                  <div style={{ width: '100%', maxWidth: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    {invisibleExpiry && <span style={{ fontSize: '10px', color: '#888' }}>{t('expires')} {new Date(invisibleExpiry).toLocaleDateString()}</span>}
                    <button
                      type="button"
                      onClick={() => { void handleRenewInvisibility(true); }}
                      disabled={isInvisibleRenewing || paymentCheckPending}
                      aria-busy={isInvisibleRenewing || paymentCheckPending}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #60a5fa', borderRadius: '6px', backgroundColor: isInvisibleRenewing || paymentCheckPending ? '#374151' : '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: isInvisibleRenewing || paymentCheckPending ? 'wait' : 'pointer', opacity: isInvisibleRenewing || paymentCheckPending ? 0.75 : 1 }}
                    >
                      {isInvisibleRenewing ? paidFeatureNoticeCopy.renewing : paidFeatureNoticeCopy.renewInvisible}
                    </button>
                  </div>
                )}
              </div>)}
              {!isViewingSelf && (
                <div style={{ width: '100%', marginTop: '16px', marginBottom: '8px', minHeight: '0' }}>
                  {showNoteBox && (<>
                    <textarea value={noteDraft} maxLength={100} onChange={(e) => savePrivateNote(activeProfile?.id, e.target.value)} placeholder={t('notePlaceholder')} rows={2} style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', padding: '6px 8px', backgroundColor: '#121212', color: '#eee', border: '1px solid #333', borderRadius: '6px', resize: 'none' }} />
                    <div style={{ fontSize: '10px', color: '#666', textAlign: 'right' }}>{noteDraft.length}/100</div>
                  </>)}
                </div>
              )}
              <div style={{ width: '100%', borderTop: '1px solid #333', margin: '4px 0 16px 0' }} />
              {targetIsManSeekingMan && (
                <div style={{ display: 'flex', gap: '6px', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, padding: '10px 4px', backgroundColor: '#e11d48', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', opacity: (isViewingSelf ? false : tagMatchesRole(filterRoleVal, activeProfile.role_pref || 'Versatile')) ? 1 : 0.3, filter: (isViewingSelf ? false : tagMatchesRole(filterRoleVal, activeProfile.role_pref || 'Versatile')) ? 'none' : 'grayscale(100%)' }}>{formatTagText(t(activeProfile.role_pref || 'Versatile'))}</div>
                  <div style={{ flex: 1, padding: '10px 4px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', opacity: (isViewingSelf ? false : tagMatchesSafety(filterSafetyVal, activeProfile.safety_pref || 'Safe')) ? 1 : 0.3, filter: (isViewingSelf ? false : tagMatchesSafety(filterSafetyVal, activeProfile.safety_pref || 'Safe')) ? 'none' : 'grayscale(100%)' }}>{formatTagText(t(activeProfile.safety_pref || 'Safe'))}</div>
                  {isViewingSelf ? (<div style={{ flex: 1, position: 'relative', display: 'flex' }}>
                    <button type="button" onClick={async () => { if (currentUser?.playstyle_pref !== 'Party' && currentUser?.playstyle_pref !== 'Party✓') return; const nextPlaystyle = playstylePref === 'Party✓' ? 'Party' : 'Party✓'; setPlaystylePref(nextPlaystyle); setFilterPlaystyleVal(nextPlaystyle); const updated = { ...activeProfile, playstyle_pref: nextPlaystyle }; setSelectedProfile(updated); await handleUpdateSelfField({ playstyle_pref: nextPlaystyle }); if (nextPlaystyle === 'Party✓') { setShowStuffBubble(true); setTimeout(() => setShowStuffBubble(false), 3000); } }} style={{ width: '100%', padding: '10px 4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: (currentUser?.playstyle_pref === 'Party' || currentUser?.playstyle_pref === 'Party✓') ? 'pointer' : 'not-allowed', textAlign: 'center', opacity: (currentUser?.playstyle_pref === 'Party' || currentUser?.playstyle_pref === 'Party✓') ? 1 : 0.4 }}>{formatTagText(t(playstylePref))}</button>
                    {showStuffBubble && (<div style={{ position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ffffff', color: '#000000', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', zIndex: 20 }}>{t('iGotStuff')}<div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderWidth: '4px', borderStyle: 'solid', borderColor: '#ffffff transparent transparent transparent' }} /></div>)}
                  </div>) : (<div style={{ flex: 1, padding: '10px 4px', backgroundColor: '#16a34a', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', opacity: tagMatchesPlaystyle(filterPlaystyleVal, activeProfile.playstyle_pref || 'Clean') ? 1 : 0.3, filter: tagMatchesPlaystyle(filterPlaystyleVal, activeProfile.playstyle_pref || 'Clean') ? 'none' : 'grayscale(100%)' }}>{formatTagText(t(activeProfile.playstyle_pref || 'Clean'))}</div>)}
                  <div style={{ flex: 1, padding: '10px 4px', backgroundColor: '#9333ea', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', opacity: (isViewingSelf ? false : tagMatchesHowMany(filterHowManyVal, activeProfile.how_many_pref || 'DoesntMatter')) ? 1 : 0.3, filter: (isViewingSelf ? false : tagMatchesHowMany(filterHowManyVal, activeProfile.how_many_pref || 'DoesntMatter')) ? 'none' : 'grayscale(100%)' }}>{formatTagText(t(activeProfile.how_many_pref || 'DoesntMatter'))}</div>
                  {isViewingSelf ? (<button type="button" onClick={async () => { const nextWhere = wherePref === 'Host' ? 'Travel' : (wherePref === 'Travel' ? null : 'Host'); setWherePref(nextWhere); const updated = { ...activeProfile, where_pref: nextWhere }; setSelectedProfile(updated); await handleUpdateSelfField({ where_pref: nextWhere }); }} style={{ flex: 1, padding: '10px 4px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', opacity: 1 }}>{formatTagText(wherePref === null ? t('Anywhere') : t(wherePref))}</button>) : (<div style={{ flex: 1, padding: '10px 4px', backgroundColor: '#d97706', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', opacity: tagMatchesWhere(filterWhereVal, activeProfile.where_pref || null) ? 1 : 0.3, filter: tagMatchesWhere(filterWhereVal, activeProfile.where_pref || null) ? 'none' : 'grayscale(100%)' }}>{formatTagText(activeProfile.where_pref ? t(activeProfile.where_pref) : t('Anywhere'))}</div>)}
                </div>
              )}
              {!isViewingSelf && passesFilterForActive && (
                <div style={{ width: '100%', marginTop: '20px' }}>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); void handleSendInterest(activeProfile); }}
                    disabled={
                      interestSendingTo === activeProfile.id ||
                      interestSendingTo !== null ||
                      activeInterestCoolingDown ||
                      activeProfile.interest_state_known !== true
                    }
                    aria-busy={interestSendingTo === activeProfile.id}
                    aria-label={
                      activeProfile.interest_state_known !== true
                        ? profileInterestCopy.unavailable
                        : activeInterestCoolingDown
                          ? profileInterestCopy.cooldown
                          : interestSendingTo === activeProfile.id
                            ? profileInterestCopy.sending
                            : profileInterestCopy.send
                    }
                    title={
                      activeProfile.interest_state_known !== true
                        ? profileInterestCopy.unavailable
                        : activeInterestCoolingDown
                          ? profileInterestCopy.cooldown
                          : profileInterestCopy.send
                    }
                    data-testid={`button-send-interest-${activeProfile.id}`}
                    style={{
                      width: '100%',
                      minHeight: '46px',
                      padding: '10px',
                      backgroundColor: activeInterestCoolingDown || activeProfile.interest_state_known !== true
                        ? '#374151'
                        : '#be123c',
                      color: activeInterestCoolingDown || activeProfile.interest_state_known !== true
                        ? '#9ca3af'
                        : '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '22px',
                      cursor: interestSendingTo || activeInterestCoolingDown || activeProfile.interest_state_known !== true
                        ? 'not-allowed'
                        : 'pointer',
                      opacity: interestSendingTo || activeInterestCoolingDown || activeProfile.interest_state_known !== true
                        ? 0.65
                        : 1,
                    }}
                  >
                    ❤️
                  </button>
                  {activeInterestStatusMessage && (
                    <div
                      role="status"
                      data-testid={`status-interest-${activeProfile.id}`}
                      style={{ marginTop: '6px', color: '#d1d5db', fontSize: '12px', textAlign: 'center' }}
                    >
                      {activeInterestStatusMessage}
                    </div>
                  )}
                </div>
              )}
              {!isViewingSelf && passesFilterForActive && (<button type="button" onClick={() => handleStartChat(activeProfile)} style={{ marginTop: '12px', width: '100%', padding: '14px', backgroundColor: '#0088cc', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                {t('sendMessage')}
              </button>)}
            </div>
          </div>
        </div>
      )}

      {starRaffleEnabled && (
        <StarMenuRaffleModule
          open={isGamesMenuOpen}
          ticketBusy={!currentUser || rafflePurchasing}
          countdown={raffleCountdown}
          ticketNotice={raffleNotice}
          items={entry.starMenuItems}
          copy={{
            menu: t('gamesApps'),
            ticketButton: raffleCopy.button,
            ticketSummary: raffleCopy.summary,
          }}
          onToggle={() => setIsGamesMenuOpen((value) => !value)}
          onBuyTicket={() => void handleBuyRaffleTicket()}
          onOpenExternal={handleOpenExternalApp}
        />
      )}
      {filterAccessNotice && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: '12px', bottom: '112px', zIndex: 6000, maxWidth: 'min(280px, calc(100vw - 24px))', padding: '9px 11px', borderRadius: '8px', border: '1px solid #4b5563', backgroundColor: '#1f2937', color: '#f3f4f6', fontSize: '12px', lineHeight: 1.4, textAlign: 'center', overflowWrap: 'anywhere', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
          {filterAccessNotice === 'ended'
            ? FILTER_UI_COPY[lang].accessEnded
            : FILTER_UI_COPY[lang].accessRestored}
          {filterAccessNotice === 'ended' && (
            <button
              type="button"
              onClick={() => { void handleRenewFilterAccess('filter_expiry_notice'); }}
              disabled={isFilterAccessRenewing}
              aria-busy={isFilterAccessRenewing}
              style={{ width: '100%', marginTop: '9px', padding: '7px 10px', border: '1px solid #60a5fa', borderRadius: '6px', backgroundColor: isFilterAccessRenewing ? '#374151' : '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: isFilterAccessRenewing ? 'wait' : 'pointer', opacity: isFilterAccessRenewing ? 0.75 : 1 }}
            >
              {isFilterAccessRenewing ? FILTER_UI_COPY[lang].renewingAccess : FILTER_UI_COPY[lang].renewFromNotice}
            </button>
          )}
        </div>
      )}
      {hideAgeNotice && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: '12px', bottom: `${112 + (filterAccessNotice ? 104 : 0)}px`, zIndex: 6000, maxWidth: 'min(280px, calc(100vw - 24px))', padding: '9px 11px', borderRadius: '8px', border: `1px solid ${hideAgeNotice === 'ended' ? '#665500' : '#166534'}`, backgroundColor: hideAgeNotice === 'ended' ? '#211b05' : '#052e16', color: hideAgeNotice === 'ended' ? '#ffe082' : '#dcfce7', fontSize: '12px', lineHeight: 1.4, textAlign: 'center', overflowWrap: 'anywhere', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
          {hideAgeNoticeMessage}
          {hideAgeNotice === 'ended' && (
            <button
              type="button"
              onClick={() => void handleRenewHideAge()}
              disabled={isHideAgeRenewing}
              aria-busy={isHideAgeRenewing}
              style={{ width: '100%', marginTop: '9px', padding: '7px 10px', border: '1px solid #60a5fa', borderRadius: '6px', backgroundColor: isHideAgeRenewing ? '#374151' : '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: isHideAgeRenewing ? 'wait' : 'pointer', opacity: isHideAgeRenewing ? 0.75 : 1 }}
            >
              {isHideAgeRenewing ? paidFeatureNoticeCopy.renewing : paidFeatureNoticeCopy.renewHideAge}
            </button>
          )}
        </div>
      )}
      {invisibleNotice && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: '12px', bottom: `${112 + (filterAccessNotice ? 104 : 0) + (hideAgeNotice ? 104 : 0)}px`, zIndex: 6000, maxWidth: 'min(280px, calc(100vw - 24px))', padding: '9px 11px', borderRadius: '8px', border: `1px solid ${invisibleNotice === 'ended' ? '#665500' : '#166534'}`, backgroundColor: invisibleNotice === 'ended' ? '#211b05' : '#052e16', color: invisibleNotice === 'ended' ? '#ffe082' : '#dcfce7', fontSize: '12px', lineHeight: 1.4, textAlign: 'center', overflowWrap: 'anywhere', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}>
          {invisibleNoticeMessage}
          {invisibleNotice === 'ended' && (
            <button
              type="button"
              onClick={() => void handleRenewInvisibility()}
              disabled={isInvisibleRenewing}
              aria-busy={isInvisibleRenewing}
              style={{ width: '100%', marginTop: '9px', padding: '7px 10px', border: '1px solid #60a5fa', borderRadius: '6px', backgroundColor: isInvisibleRenewing ? '#374151' : '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: isInvisibleRenewing ? 'wait' : 'pointer', opacity: isInvisibleRenewing ? 0.75 : 1 }}
            >
              {isInvisibleRenewing ? paidFeatureNoticeCopy.renewing : paidFeatureNoticeCopy.renewInvisible}
            </button>
          )}
        </div>
      )}
      {activePaymentMarker && paymentRecheckPhase && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            right: '12px',
            bottom: `${112 + (filterAccessNotice ? 104 : 0) + (hideAgeNotice ? 104 : 0) + (invisibleNotice ? 104 : 0)}px`,
            zIndex: 6001,
            maxWidth: 'min(280px, calc(100vw - 24px))',
            padding: '9px 11px',
            borderRadius: '8px',
            border: '1px solid #4b5563',
            backgroundColor: '#1f2937',
            color: '#f3f4f6',
            fontSize: '12px',
            lineHeight: 1.4,
            textAlign: 'center',
            overflowWrap: 'anywhere',
            boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          }}
        >
          <div>{paymentRecheckMessage}</div>
          {paymentRetryAvailable && (
            <button
              type="button"
              onClick={() => { void retryPendingPaymentCheck(); }}
              disabled={isPaymentRetryRunning}
              aria-busy={isPaymentRetryRunning}
              style={{
                width: '100%',
                marginTop: '9px',
                padding: '7px 10px',
                border: '1px solid #60a5fa',
                borderRadius: '6px',
                backgroundColor: isPaymentRetryRunning ? '#374151' : '#2563eb',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isPaymentRetryRunning ? 'wait' : 'pointer',
                opacity: isPaymentRetryRunning ? 0.75 : 1,
              }}
            >
              {isPaymentRetryRunning
                ? PAYMENT_RECHECK_COPY[lang].checkingButton
                : PAYMENT_RECHECK_COPY[lang].checkAgain}
            </button>
          )}
        </div>
      )}

      {walletModuleLoaded && (
        <Suspense fallback={null}>
          <WalletConnectModule
            manifestUrl={config.tonConnectManifestUrl}
            actionRequest={walletActionRequest}
            onConnectionChange={setIsWalletConnected}
          />
        </Suspense>
      )}

      <BottomNavigationModule
        view={view}
        gridEnabled={gridFilterEnabled}
        mapEnabled={mapModuleEnabled}
        gridVisible={gridVisible}
        mapVisible={mapVisible}
        walletConnected={isWalletConnected}
        onGrid={handleToggleGrid}
        onChat={() => handleOpenExternalApp(entry.chatUrl)}
        onWallet={handleWalletClick}
        onMap={handleToggleMap}
        t={t}
      />

      {flyingMessageEnabled && (
        <FlyingMessageModule
          messages={flyingMessages}
          text={flyingMessageText}
          placeholder={flyingCopy.placeholder}
          priceLabel={effectiveFlyingMessagePrice > 0 ? `${effectiveFlyingMessagePrice} ⭐` : flyingCopy.free}
          sendLabel={flyingCopy.send}
          status={flyingComposerStatus}
           statusPersistent={flyingMessageNoticeState.persistent}
           dismissLabel={flyingCopy.dismiss}
           onDismissStatus={dismissFlyingMessageNotice}
          inputDisabled={!currentUser || sendingFlyingMessage || flyingMessageWaitSeconds > 0}
          sendDisabled={!currentUser || !flyingMessageText.trim() || sendingFlyingMessage || flyingMessageWaitSeconds > 0}
          onTextChange={setFlyingMessageText}
          onSubmit={(event) => { event.preventDefault(); void handleSendFlyingMessage(); }}
        />
      )}

      {showProfileSetupPreview && isAdmin && (
        <div
          onClick={() => setShowProfileSetupPreview(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            backgroundColor: 'rgba(0,0,0,0.76)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
            boxSizing: 'border-box',
            overflowY: 'auto',
          }}
        >
          <div
            ref={profileSetupPreviewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-setup-preview-title"
            data-testid="dialog-profile-setup-preview"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '1104px',
              maxHeight: 'calc(100vh - 24px)',
              overflowY: 'auto',
              borderRadius: '16px',
              outline: 'none',
            }}
          >
            <Suspense
              fallback={
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    padding: '24px',
                    borderRadius: '12px',
                    backgroundColor: '#161616',
                    color: '#ccc',
                    textAlign: 'center',
                  }}
                >
                  {t('loading')}
                </div>
              }
            >
              <ProfileSetupPreviewModule
                entries={Object.values(config.entries)}
                language={lang}
                onClose={() => setShowProfileSetupPreview(false)}
                t={t}
              />
            </Suspense>
          </div>
        </div>
      )}

      {showRolesModal && (
        <div onClick={() => setShowRolesModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 3000, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #333' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>{t('adminVipList')}</h2>
              <button type="button" onClick={() => setShowRolesModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }} aria-label={t('close')}>×</button>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input value={newRoleUsername} onChange={(e) => setNewRoleUsername(e.target.value)} placeholder={t('roleUsernamePlaceholder')} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '13px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'admin' | 'vip')} style={{ flex: 1, padding: '9px 10px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '13px' }}>
                  <option value="vip">{t('vip')}</option>
                  <option value="admin">{t('admin')}</option>
                </select>
                <button type="button" onClick={handleAddRole} style={{ padding: '9px 16px', backgroundColor: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>{t('addRole')}</button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', backgroundColor: '#232323', border: '1px solid #333', borderRadius: '8px', opacity: 0.55 }}>
                <span style={{ fontSize: '13px', color: '#aaa' }}>@mileschan852 <span style={{ fontSize: '11px', color: '#f5c518' }}>· {t('owner')}</span></span>
                <span style={{ fontSize: '11px', color: '#666' }}>{t('admin')}</span>
              </div>
              {rolesLoading && <div role="status" style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '10px' }}>{t('loading')}</div>}
              {rolesLoadError && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#fca5a5', fontSize: '12px', padding: '10px' }}>
                  <span>{rolesLoadError}</span>
                  <button type="button" onClick={() => void loadRoles()} style={{ padding: '4px 8px', border: '1px solid #555', borderRadius: '5px', background: '#2a2a2a', color: '#fff', cursor: 'pointer' }}>{t('refresh')}</button>
                </div>
              )}
              {!rolesLoading && !rolesLoadError && roles
                .filter((r) => (r.username || '').toLowerCase() !== 'mileschan852')
                .map((r) => (
                  <div key={r.username} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', backgroundColor: '#232323', border: '1px solid #333', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#fff' }}>@{r.username} <span style={{ fontSize: '11px', color: r.role === 'admin' ? '#4ade80' : '#f5c518' }}>· {r.role === 'admin' ? t('admin') : t('vip')}</span></span>
                    <button type="button" onClick={() => handleRemoveRole(r.username)} style={{ padding: '4px 10px', backgroundColor: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '6px', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>{t('removeRole')}</button>
                  </div>
                ))}
              {!rolesLoading && !rolesLoadError && roles.filter((r) => (r.username || '').toLowerCase() !== 'mileschan852').length === 0 && (
                <div style={{ fontSize: '12px', color: '#777', textAlign: 'center', padding: '10px' }}>{t('noRolesYet')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showVipCampaignsModal && (
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.75)',
                color: '#fff',
              }}
            >
              {vipGrantCopy[lang].campaignsLoading}
            </div>
          }
        >
          <VipCampaignPanel
            campaigns={vipCampaigns}
            hasMore={vipCampaignsHasMore}
            loading={vipCampaignsLoading}
            error={vipCampaignsError}
            notice={vipCampaignsNotice}
            stoppingCampaignId={stoppingVipCampaignId}
            failedRewardCampaignId={failedRewardCampaignId}
            failedRewardClaims={failedRewardClaims}
            failedRewardClaimsHasMore={failedRewardClaimsHasMore}
            failedRewardClaimsLoading={failedRewardClaimsLoading}
            failedRewardClaimsError={failedRewardClaimsError}
            retryingFailedRewardClaimId={retryingFailedRewardClaimId}
          crossCampaignFailedRewardSearchValue={crossCampaignFailedRewardSearch}
          crossCampaignFailedRewardSourceBotKey={crossCampaignFailedRewardSourceBot}
          crossCampaignFailedRewardSearched={crossCampaignFailedRewardSearched}
          crossCampaignFailedRewardClaims={crossCampaignFailedRewardClaims}
          crossCampaignFailedRewardClaimsHasMore={crossCampaignFailedRewardClaimsHasMore}
          crossCampaignFailedRewardClaimsLoading={crossCampaignFailedRewardClaimsLoading}
          crossCampaignFailedRewardClaimsError={crossCampaignFailedRewardClaimsError}
          onCrossCampaignFailedRewardSearchChange={setCrossCampaignFailedRewardSearch}
          onCrossCampaignFailedRewardSourceChange={setCrossCampaignFailedRewardSourceBot}
          onSearchCrossCampaignFailedRewards={searchCrossCampaignFailedRewardClaims}
          onLoadMoreCrossCampaignFailedRewards={loadMoreCrossCampaignFailedRewardClaims}
          retryAuditCampaignId={retryAuditCampaignId}
          retryAuditRecords={retryAuditRecords}
          retryAuditHasMore={retryAuditHasMore}
          retryAuditLoading={retryAuditLoading}
          retryAuditError={retryAuditError}
          newFailureAlert={vipFailureAlert}
          failureAlertLoading={vipFailureAlertLoading}
          failureAlertError={vipFailureAlertError}
          queueHealth={vipRewardQueueHealth}
          queueHealthLoading={vipRewardQueueHealthLoading}
          queueHealthError={vipRewardQueueHealthError}
          copy={{
            title: vipGrantCopy[lang].campaignsTitle,
            campaign: vipGrantCopy[lang].campaign,
            sourceApp: vipGrantCopy[lang].sourceApp,
            legacySourceApp: vipGrantCopy[lang].legacySourceApp,
            empty: vipGrantCopy[lang].campaignsEmpty,
            loading: vipGrantCopy[lang].campaignsLoading,
            loadMore: vipGrantCopy[lang].campaignsLoadMore,
            refresh: vipGrantCopy[lang].campaignsRefresh,
            close: t('close'),
            active: vipGrantCopy[lang].campaignActive,
            ended: vipGrantCopy[lang].campaignEnded,
            inactive: vipGrantCopy[lang].campaignInactive,
            duration: vipGrantCopy[lang].campaignDuration,
            randomDuration: vipGrantCopy[lang].campaignRandomDuration,
            window: vipGrantCopy[lang].campaignWindow,
            noCutoff: vipGrantCopy[lang].campaignNoCutoff,
            cutoff: vipGrantCopy[lang].campaignCutoff,
            claimCount: vipGrantCopy[lang].campaignClaims,
            failedRewardNotifications: vipGrantCopy[lang].campaignFailedRewardNotifications,
            failedRewardNotificationsUnavailable: vipGrantCopy[lang].campaignFailedRewardNotificationsUnavailable,
            failedRewardsReview: vipGrantCopy[lang].campaignFailedRewardsReview,
            crossCampaignFailedRewardsTitle: vipGrantCopy[lang].campaignCrossFailedRewardsTitle,
            crossCampaignFailedRewardsPlaceholder: vipGrantCopy[lang].campaignCrossFailedRewardsPlaceholder,
            crossCampaignFailedRewardsSearch: vipGrantCopy[lang].campaignCrossFailedRewardsSearch,
            crossCampaignFailedRewardsSourceBot: vipGrantCopy[lang].campaignCrossFailedRewardsSourceBot,
            crossCampaignFailedRewardsAllSources: vipGrantCopy[lang].campaignCrossFailedRewardsAllSources,
            crossCampaignFailedRewardsInitialHint: vipGrantCopy[lang].campaignCrossFailedRewardsInitialHint,
            crossCampaignFailedRewardsDetails: vipGrantCopy[lang].campaignCrossFailedRewardsDetails,
            failedRewardsEmpty: vipGrantCopy[lang].campaignFailedRewardsEmpty,
            failedRewardDeliveryUncertain: vipGrantCopy[lang].campaignFailedRewardDeliveryUncertain,
            failedRewardDeliveryUncertainConfirm: vipGrantCopy[lang].campaignFailedRewardDeliveryUncertainConfirm,
            failedRewardsLoading: vipGrantCopy[lang].campaignFailedRewardsLoading,
            failedRewardsLoadFailed: vipGrantCopy[lang].campaignFailedRewardsLoadFailed,
            failedRewardClaim: vipGrantCopy[lang].campaignFailedRewardClaim,
            failedRewardRecipient: vipGrantCopy[lang].campaignFailedRewardRecipient,
            failedRewardDetails: vipGrantCopy[lang].campaignFailedRewardDetails,
            failedRewardLastAttempt: vipGrantCopy[lang].campaignFailedRewardLastAttempt,
            failedRewardRetry: vipGrantCopy[lang].campaignFailedRewardRetry,
            failedRewardRetrying: vipGrantCopy[lang].campaignFailedRewardRetrying,
            failedRewardRetryLimit: vipGrantCopy[lang].campaignFailedRewardRetryLimit,
            failedRewardRetrySent: vipGrantCopy[lang].campaignFailedRewardRetrySent,
            failedRewardRetryFailed: vipGrantCopy[lang].campaignFailedRewardRetryFailed,
            failedRewardLoadMore: vipGrantCopy[lang].campaignFailedRewardLoadMore,
            retryAuditToggle: vipGrantCopy[lang].campaignRetryAuditToggle,
            retryAuditTitle: vipGrantCopy[lang].campaignRetryAuditTitle,
            retryAuditEmpty: vipGrantCopy[lang].campaignRetryAuditEmpty,
            retryAuditLoading: vipGrantCopy[lang].campaignRetryAuditLoading,
            retryAuditLoadFailed: vipGrantCopy[lang].campaignRetryAuditLoadFailed,
            retryAuditEntry: vipGrantCopy[lang].campaignRetryAuditEntry,
            retryAuditPending: vipGrantCopy[lang].campaignRetryAuditPending,
            retryAuditDelivered: vipGrantCopy[lang].campaignRetryAuditDelivered,
            retryAuditFailed: vipGrantCopy[lang].campaignRetryAuditFailed,
            retryAuditUncertain: vipGrantCopy[lang].campaignRetryAuditUncertain,
            retryAuditLoadMore: vipGrantCopy[lang].campaignRetryAuditLoadMore,
            newFailureAlertTitle: vipGrantCopy[lang].campaignNewFailureAlertTitle,
            newFailureAlertSeparate: vipGrantCopy[lang].campaignNewFailureAlertSeparate,
            newFailureAlertLatest: vipGrantCopy[lang].campaignNewFailureAlertLatest,
            newFailureAlertChecking: vipGrantCopy[lang].campaignNewFailureAlertChecking,
            newFailureAlertLoadFailed: vipGrantCopy[lang].campaignNewFailureAlertLoadFailed,
            queueHealthTitle: vipGrantCopy[lang].campaignQueueHealthTitle,
            queueHealthSeparate: vipGrantCopy[lang].campaignQueueHealthSeparate,
            queueHealthPending: vipGrantCopy[lang].campaignQueueHealthPending,
            queueHealthExpiredSending: vipGrantCopy[lang].campaignQueueHealthExpiredSending,
            queueHealthOldest: vipGrantCopy[lang].campaignQueueHealthOldest,
            queueHealthEmpty: vipGrantCopy[lang].campaignQueueHealthEmpty,
            queueHealthChecking: vipGrantCopy[lang].campaignQueueHealthChecking,
            queueHealthLoadFailed: vipGrantCopy[lang].campaignQueueHealthLoadFailed,
            newUsers: vipGrantCopy[lang].campaignNewUsers,
            announcementStatus: vipGrantCopy[lang].announcementStatus,
            announcementPending: vipGrantCopy[lang].announcementPending,
            announcementDelivered: vipGrantCopy[lang].announcementDelivered,
            announcementFailed: vipGrantCopy[lang].announcementFailed,
            announcementCancelled: vipGrantCopy[lang].announcementCancelled,
            announcementLegacy: vipGrantCopy[lang].announcementLegacy,
            stop: vipGrantCopy[lang].campaignStop,
            stopping: vipGrantCopy[lang].campaignStopping,
          }}
          sourceAppLabels={{
            botA: Object.values(config.entries).find((candidate) => candidate.botKey === 'botA')?.label ?? 'botA',
            botB: Object.values(config.entries).find((candidate) => candidate.botKey === 'botB')?.label ?? 'botB',
          }}
          windowLabels={{
            '1_day': t('period_1d'),
            '3_days': t('period_3d'),
            today: vipGrantCopy[lang].today,
            week: vipGrantCopy[lang].week,
            month: vipGrantCopy[lang].month,
          }}
          formatDate={(value) => new Intl.DateTimeFormat(lang, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Hong_Kong',
          }).format(new Date(value))}
          onClose={() => setShowVipCampaignsModal(false)}
          onRefresh={() => {
            void loadVipCampaigns(0, false);
            void loadNewVipFailureAlerts();
            void loadVipRewardQueueHealth();
          }}
          onLoadMore={() => void loadVipCampaigns(vipCampaigns.length, true)}
          onStop={(campaignId) => void handleStopVipCampaign(campaignId)}
          onToggleFailedRewards={toggleFailedRewardClaims}
          onLoadMoreFailedRewards={loadMoreFailedRewardClaims}
          onRetryFailedReward={(claimId) => void retryFailedVipReward(claimId)}
          onToggleRetryAudit={toggleVipRewardRetryAudit}
            onLoadMoreRetryAudit={loadMoreVipRewardRetryAudit}
          />
        </Suspense>
      )}

      {showPaymentReview && isAdmin && (
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.75)',
                color: '#fff',
              }}
            >
              {paymentReviewCopy[lang].loading}
            </div>
          }
        >
          <PaymentReviewPanel
          payments={paymentRecords}
          hasMore={paymentsHasMore}
          loading={paymentsLoading}
          error={paymentsError}
          search={paymentsSearch}
          passLookup={passLookupResult}
          passLookupLoading={passLookupLoading}
          passLookupError={passLookupError}
          passLookupSearch={passLookupSearch}
          passLookupSearchBy={passLookupSearchBy}
          copy={paymentReviewCopy[lang]}
          formatDate={(value) => new Intl.DateTimeFormat(lang, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Hong_Kong',
          }).format(new Date(value))}
          onSearchChange={setPaymentsSearch}
          onSearch={() => void loadAdminPayments(paymentsSearch, 0, false)}
          onPassLookupSearchChange={(value) => {
            passPaymentLookupRequestRef.current += 1;
            setPassLookupSearch(value);
            setPassLookupLoading(false);
            setPassLookupError('');
            setPassLookupResult(null);
          }}
          onPassLookupSearchByChange={(value) => {
            passPaymentLookupRequestRef.current += 1;
            setPassLookupSearchBy(value);
            setPassLookupLoading(false);
            setPassLookupError('');
            setPassLookupResult(null);
          }}
          onPassLookup={() => void loadPassPaymentLookup(
            passLookupSearch,
            passLookupSearchBy,
          )}
          onRefresh={() => void loadAdminPayments(paymentsSearch, 0, false)}
          onLoadMore={() => void loadAdminPayments(
            paymentsSearch,
            paymentRecords.length,
            true,
          )}
          onClose={closePaymentReview}
          raffleReview={{
            intents: rafflePaymentIntents,
            hasMore: rafflePaymentHasMore,
            loading: rafflePaymentLoading,
            error: rafflePaymentError,
            search: rafflePaymentSearch,
            recoveringIntentId: raffleRecoveringIntentId,
            notice: raffleRecoveryNotice,
            recoveryError: raffleRecoveryError,
            copy: rafflePaymentReviewCopy[lang],
            onSearchChange: (value) => {
              rafflePaymentReviewRequestRef.current += 1;
              setRafflePaymentSearch(value);
              setRafflePaymentLoading(false);
              setRafflePaymentError('');
            },
            onSearch: () => void loadRafflePaymentReview(rafflePaymentSearch, 0, false),
            onRefresh: () => void loadRafflePaymentReview(rafflePaymentSearch, 0, false),
            onLoadMore: () => void loadRafflePaymentReview(
              rafflePaymentSearch,
              rafflePaymentIntents.length,
              true,
            ),
            onRecover: (intentId, action) => void recoverRafflePayment(intentId, action),
            }}
          />
        </Suspense>
      )}

      {vipGrantNotice && (
        <VipGrantNoticeDialog
          title={vipGrantCopy[lang].popupTitle}
          body={vipGrantCopy[lang].popupBody.replace('{days}', String(vipGrantNotice.days))}
          confirmLabel={vipGrantCopy[lang].popupConfirm}
          retryLabel={vipGrantCopy[lang].popupRetry}
          confirmingLabel={vipGrantCopy[lang].popupSaving}
          confirming={vipGrantAcknowledging}
          errorMessage={vipGrantAcknowledgementError}
          onConfirm={handleAcknowledgeVipGrant}
          onDismiss={() => {
            if (vipGrantAcknowledgementLockRef.current) return;
            setVipGrantNotice(null);
            setVipGrantAcknowledgementError('');
          }}
        />
      )}
    </div>
  );
}

