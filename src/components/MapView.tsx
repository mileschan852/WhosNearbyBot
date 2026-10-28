import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import type { UserProfile } from '../App';
import { MAP_ACTIVITY_COPY, MAP_ACTIVITY_REPORT_COPY, type MapActivityLang } from '../modules/map/map-activity-copy';

interface MapViewProps {
  location: { lat: number; lng: number };
  isVisible: boolean;
  currentUser: UserProfile | null;
  users: UserProfile[];
  gridVisible: boolean;
  isOnline: (lastSeen?: string | null) => boolean;
  profileImageLabel: string;
  onSelectProfile: (user: UserProfile) => void;
  lang: MapActivityLang;
  apiPost: (path: string, body?: Record<string, unknown>) => Promise<any>;
  startInvoice: (invoiceLink: string) => Promise<string>;
  onPartyPriceChanged: (price: number) => void;
  isAdmin: boolean;
}

interface PartyPost {
  id: string;
  lat: number;
  lng: number;
  durationHours: number;
  maxPeople: number;
  soughtRoles: string[];
  joinCostStars: number;
  note: string;
  createdAt: string;
  expiresAt: string;
  isMine: boolean;
  host: { name: string; username: string; avatar: string };
}

interface CruisingSpot {
  id: string;
  lat: number;
  lng: number;
  status: 'provisional' | 'confirmed';
  yesVotes: number;
  createdAt: string;
  expiresAt: string | null;
  isMine: boolean;
  hasVoted: boolean;
  myVoteYes: boolean | null;
  canVote: boolean;
}

interface PartyFormValues {
  durationHours: string;
  maxPeople: string;
  soughtRoles: string[];
  joinCostStars: string;
  note: string;
}

interface MapActivityReport {
  id: string;
  activity_type: 'party' | 'cruising_spot';
  target_id: string;
  reporter_profile_id: string;
  reason: 'unsafe' | 'misleading' | 'inappropriate' | 'spam' | 'other';
  details: string;
  status: 'open' | 'dismissed' | 'actioned';
  reviewed_by_profile_id: string | null;
  reviewed_at: string | null;
  admin_note: string;
  created_at: string;
  targetSummary?: { note?: string; status?: string; moderation_status?: string; expires_at?: string; created_at?: string } | null;
}

interface MapActivityModerationEvent {
  id: string;
  activity_type: 'party' | 'cruising_spot';
  target_id: string;
  admin_profile_id: string;
  action: string;
  note: string;
  created_at: string;
}

function MapController({
  latitude,
  longitude,
  isVisible,
}: {
  latitude: number;
  longitude: number;
  isVisible: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!isVisible) return;
    const frameId = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      map.setView([latitude, longitude], 15, { animate: false });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [latitude, longitude, isVisible, map]);
  return null;
}

function safeAvatarUrl(avatar: string): string | null {
  try {
    const url = new URL(avatar, window.location.href);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function createPartyIcon(host: PartyPost['host']) {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'relative',
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: '3px solid #f59e0b',
    boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
    backgroundColor: '#222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  const avatar = document.createElement('div');
  Object.assign(avatar.style, {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  const avatarUrl = host.avatar ? safeAvatarUrl(host.avatar) : null;
  if (avatarUrl) {
    const image = document.createElement('img');
    image.src = avatarUrl;
    image.alt = host.name || 'Party host';
    image.loading = 'lazy';
    Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'cover' });
    avatar.appendChild(image);
  } else {
    const initial = document.createElement('span');
    initial.textContent = host.name ? host.name.charAt(0).toUpperCase() : 'U';
    Object.assign(initial.style, {
      color: '#fff',
      fontSize: '16px',
      fontWeight: 'bold',
    });
    avatar.appendChild(initial);
  }
  root.appendChild(avatar);
  const badge = document.createElement('span');
  badge.textContent = '🎉';
  Object.assign(badge.style, {
    position: 'absolute',
    right: '-7px',
    top: '-9px',
    fontSize: '15px',
    lineHeight: '18px',
    textShadow: '0 1px 4px #000',
  });
  root.appendChild(badge);
  return L.divIcon({
    className: 'map-party-pin',
    html: root,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createCruisingSpotIcon(confirmed: boolean) {
  const fish = document.createElement('span');
  fish.textContent = '🐟';
  Object.assign(fish.style, {
    display: 'flex',
    width: '36px',
    height: '36px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    border: `2px solid ${confirmed ? '#22c55e' : '#60a5fa'}`,
    background: 'rgba(17,24,39,0.95)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
    fontSize: '20px',
  });
  return L.divIcon({
    className: 'map-cruising-spot-pin',
    html: fish,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createProfileIcon(
  user: UserProfile,
  isEnabled: boolean,
  isSelf: boolean,
  isOnline: boolean,
  profileImageLabel: string,
) {
  const borderColor = isSelf ? '#00ffff' : (isEnabled ? '#007bff' : '#555');
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'relative',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    overflow: 'visible',
    border: `3px solid ${borderColor}`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
    backgroundColor: '#222',
    opacity: isEnabled ? '1' : '0.3',
    filter: isEnabled ? 'none' : 'grayscale(100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const avatar = document.createElement('div');
  Object.assign(avatar.style, {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const avatarUrl = user.avatar ? safeAvatarUrl(user.avatar) : null;
  if (avatarUrl) {
    const image = document.createElement('img');
    image.src = avatarUrl;
    image.alt = user.name || profileImageLabel;
    image.loading = 'lazy';
    Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'cover' });
    avatar.appendChild(image);
  } else {
    const initial = document.createElement('div');
    initial.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    Object.assign(initial.style, {
      width: '100%',
      height: '100%',
      backgroundColor: '#0088cc',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: '14px',
    });
    avatar.appendChild(initial);
  }
  root.appendChild(avatar);

  if (isOnline) {
    const onlineDot = document.createElement('div');
    Object.assign(onlineDot.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: '10px',
      height: '10px',
      backgroundColor: '#4ade80',
      borderRadius: '50%',
      border: '2px solid #121212',
      zIndex: '10',
    });
    root.appendChild(onlineDot);
  }

  return L.divIcon({
    className: 'custom-map-pin',
    html: root,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function MapView({
  location,
  isVisible,
  currentUser,
  users,
  gridVisible,
  isOnline,
  profileImageLabel,
  onSelectProfile,
  lang,
  apiPost,
  startInvoice,
  onPartyPriceChanged,
  isAdmin,
}: MapViewProps) {
  const text = MAP_ACTIVITY_COPY[lang];
  const reportText = MAP_ACTIVITY_REPORT_COPY[lang];
  const [parties, setParties] = useState<PartyPost[]>([]);
  const [cruisingSpots, setCruisingSpots] = useState<CruisingSpot[]>([]);
  const [effectivePostPrice, setEffectivePostPrice] = useState(0);
  const [activitiesError, setActivitiesError] = useState('');
  const [activityNotice, setActivityNotice] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [dialog, setDialog] = useState<'host-prompt' | 'party-form' | 'party-details' | 'spot-details' | 'report' | 'admin-reports' | null>(null);
  const [selectedParty, setSelectedParty] = useState<PartyPost | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<CruisingSpot | null>(null);
  const [reportReason, setReportReason] = useState<MapActivityReport['reason']>('unsafe');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [adminReports, setAdminReports] = useState<MapActivityReport[]>([]);
  const [moderationEvents, setModerationEvents] = useState<MapActivityModerationEvent[]>([]);
  const [adminReportsLoading, setAdminReportsLoading] = useState(false);
  const [partyForm, setPartyForm] = useState<PartyFormValues>({
    durationHours: '2',
    maxPeople: '4',
    soughtRoles: [],
    joinCostStars: '0',
    note: '',
  });
  const apiPostRef = useRef(apiPost);
  const startInvoiceRef = useRef(startInvoice);
  const onPartyPriceChangedRef = useRef(onPartyPriceChanged);
  apiPostRef.current = apiPost;
  startInvoiceRef.current = startInvoice;
  onPartyPriceChangedRef.current = onPartyPriceChanged;

  const refreshActivities = async (showLoading = false) => {
    if (!currentUser) return;
    if (showLoading) setActivityLoading(true);
    try {
      const data = await apiPostRef.current('/api/map/activities');
      if (!Array.isArray(data?.parties) || !Array.isArray(data?.cruisingSpots)) {
        throw new Error('Map activities returned invalid data.');
      }
      setParties(data.parties as PartyPost[]);
      setCruisingSpots(data.cruisingSpots as CruisingSpot[]);
      const basePrice = Number(data.partyPostPrice);
      const effectivePrice = Number(data.effectivePartyPostPrice);
      if (Number.isSafeInteger(basePrice) && basePrice >= 0) {
        onPartyPriceChangedRef.current(basePrice);
      }
      setEffectivePostPrice(
        Number.isSafeInteger(effectivePrice) && effectivePrice >= 0 ? effectivePrice : 0,
      );
      setActivitiesError('');
    } catch (error) {
      setActivitiesError(error instanceof Error ? error.message : text.loadFailed);
    } finally {
      if (showLoading) setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (!isVisible || !currentUser) return;
    let active = true;
    let loading = false;
    const load = async () => {
      if (!active || loading) return;
      loading = true;
      await refreshActivities(true);
      loading = false;
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isVisible, currentUser?.id, location.lat, location.lng]);

  useEffect(() => {
    if (!dialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !activityBusy) setDialog(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dialog, activityBusy]);

  const canPublishLocation = currentUser?.map_visible === true && gridVisible;
  const closeDialog = () => {
    if (activityBusy) return;
    setDialog(null);
    setSelectedParty(null);
    setSelectedSpot(null);
  };
  const updateRole = (role: string) => {
    setPartyForm((current) => ({
      ...current,
      soughtRoles: current.soughtRoles.includes(role)
        ? current.soughtRoles.filter((item) => item !== role)
        : [...current.soughtRoles, role],
    }));
  };
  const pollPartyPost = async (intentId: string) => {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      try {
        const status = await apiPostRef.current('/api/map/party/status', { intentId });
        if (status?.status === 'fulfilled' && status?.postId) return true;
        if (['cancelled', 'expired'].includes(status?.status)) return false;
      } catch {
        // A short retry window allows Telegram's payment webhook to finish.
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    return false;
  };
  const publishParty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const durationHours = Number(partyForm.durationHours);
    const maxPeople = Number(partyForm.maxPeople);
    const joinCostStars = Number(partyForm.joinCostStars);
    if (!partyForm.soughtRoles.length ||
        !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24 ||
        !Number.isInteger(maxPeople) || maxPeople < 1 || maxPeople > 100 ||
        !Number.isInteger(joinCostStars) || joinCostStars < 0 || joinCostStars > 100_000) {
      setActivityNotice(text.requiredFields);
      return;
    }
    setActivityBusy(true);
    setActivityNotice('');
    try {
      const result = await apiPostRef.current('/api/map/party', {
        durationHours,
        maxPeople,
        soughtRoles: partyForm.soughtRoles,
        joinCostStars,
        note: partyForm.note,
      });
      if (result?.invoiceLink && result?.intentId) {
        const invoiceStatus = await startInvoiceRef.current(String(result.invoiceLink));
        if (invoiceStatus === 'paid') {
          setActivityNotice(text.postPaid);
          const fulfilled = await pollPartyPost(String(result.intentId));
          if (!fulfilled) {
            setActivityNotice(text.postPending);
            return;
          }
        } else {
          try {
            await apiPostRef.current('/api/map/party/cancel', { intentId: result.intentId });
          } catch {
            // The invoice intent expires server-side if cancellation cannot be recorded.
          }
          setActivityNotice(invoiceStatus === 'unsupported' ? text.postPending : text.postCancelled);
          return;
        }
      } else if (result?.ok !== true || !result?.post?.id) {
        throw new Error('Party could not be posted.');
      }
      await refreshActivities();
      setDialog(null);
      setSelectedParty(null);
      setActivityNotice(text.postCreated);
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : 'Party could not be posted.');
    } finally {
      setActivityBusy(false);
    }
  };
  const markCruisingSpot = async () => {
    setActivityBusy(true);
    setActivityNotice('');
    try {
      await apiPostRef.current('/api/map/cruising-spot');
      await refreshActivities();
      setActivityNotice(text.spotCreated);
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : 'Cruising spot could not be marked.');
    } finally {
      setActivityBusy(false);
    }
  };
  const voteForSpot = async (voteYes: boolean) => {
    if (!selectedSpot) return;
    setActivityBusy(true);
    setActivityNotice('');
    try {
      await apiPostRef.current('/api/map/cruising-spot/vote', {
        spotId: selectedSpot.id,
        voteYes,
      });
      await refreshActivities();
      setDialog(null);
      setSelectedSpot(null);
      setActivityNotice(text.voteSaved);
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : text.spotVoted);
    } finally {
      setActivityBusy(false);
    }
  };
  const endParty = async () => {
    if (!selectedParty) return;
    setActivityBusy(true);
    try {
      await apiPostRef.current('/api/map/party/end', { postId: selectedParty.id });
      await refreshActivities();
      setDialog(null);
      setSelectedParty(null);
      setActivityNotice(text.partyEnded);
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : 'Party could not be ended.');
    } finally {
      setActivityBusy(false);
    }
  };
  const openReportDialog = () => {
    setReportReason('unsafe');
    setReportDetails('');
    setDialog('report');
  };
  const submitActivityReport = async () => {
    const activityType = selectedParty ? 'party' : selectedSpot ? 'cruising_spot' : null;
    const targetId = selectedParty?.id || selectedSpot?.id;
    if (!activityType || !targetId) return;
    setReportBusy(true);
    try {
      const result = await apiPostRef.current('/api/map/activity/report', {
        activityType, targetId, reason: reportReason, details: reportDetails.trim(),
      });
      setDialog(null);
      setSelectedParty(null);
      setSelectedSpot(null);
      setActivityNotice(result?.duplicate ? reportText.reportDuplicate : reportText.reportSent);
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : reportText.reportFailed);
    } finally {
      setReportBusy(false);
    }
  };
  const loadAdminReports = async () => {
    setAdminReportsLoading(true);
    try {
      const result = await apiPostRef.current('/api/admin/map-activity-reports', { action: 'list' });
      if (!Array.isArray(result?.reports) || !Array.isArray(result?.events)) throw new Error(reportText.reportFailed);
      setAdminReports(result.reports as MapActivityReport[]);
      setModerationEvents(result.events as MapActivityModerationEvent[]);
      setDialog('admin-reports');
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : reportText.reportFailed);
    } finally {
      setAdminReportsLoading(false);
    }
  };
  const reviewReport = async (report: MapActivityReport, action: 'dismiss' | 'hide' | 'remove' | 'restore') => {
    setReportBusy(true);
    try {
      await apiPostRef.current('/api/admin/map-activity-reports', { action, reportId: report.id });
      const result = await apiPostRef.current('/api/admin/map-activity-reports', { action: 'list' });
      setAdminReports(result.reports as MapActivityReport[]);
      setModerationEvents(result.events as MapActivityModerationEvent[]);
      await refreshActivities();
    } catch (error) {
      setActivityNotice(error instanceof Error ? error.message : reportText.reportFailed);
    } finally {
      setReportBusy(false);
    }
  };
  const openHostChat = () => {
    const username = selectedParty?.host.username.replace(/^@/, '').trim();
    if (!username) return;
    const url = `https://t.me/${encodeURIComponent(username)}`;
    const webApp = (window as any).Telegram?.WebApp;
    if (typeof webApp?.openTelegramLink === 'function') webApp.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  };
  const formatSpotVotes = (count: number) => text.spotVotes.replace('{count}', String(count));
  const formatDate = (value: string) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(lang) : '—';
  };

  return (
    <MapContainer
      center={[location.lat, location.lng]}
      zoom={15}
      style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      zoomControl={false}
    >
      <MapController
        latitude={location.lat}
        longitude={location.lng}
        isVisible={isVisible}
      />
      <TileLayer
        className="dark-map-tiles"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <div
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          zIndex: 1200,
          top: '12px',
          left: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '7px',
          maxWidth: 'calc(100% - 24px)',
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActivityNotice('');
            setDialog('host-prompt');
          }}
          disabled={activityBusy || !canPublishLocation}
          aria-label={text.hostParty}
          style={mapActionButtonStyle('#92400e')}
        >
          {text.hostParty}
        </button>
        <button
          type="button"
          onClick={() => void markCruisingSpot()}
          disabled={activityBusy || !canPublishLocation}
          aria-label={text.markSpot}
          style={mapActionButtonStyle('#1d4ed8')}
        >
          {text.markSpot}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => void loadAdminReports()}
            disabled={adminReportsLoading}
            style={mapActionButtonStyle('#374151')}
          >
            {adminReportsLoading ? text.loading : reportText.reviewReports}
          </button>
        )}
        {!canPublishLocation && (
          <div
            role="status"
            style={{
              padding: '6px 8px',
              borderRadius: '7px',
              background: 'rgba(17,24,39,0.94)',
              color: '#fca5a5',
              fontSize: '11px',
              maxWidth: '280px',
              pointerEvents: 'auto',
            }}
          >
            Turn on Map visibility and turn off Invisibility before adding a location pin.
          </div>
        )}
        {activityLoading && <div role="status" style={mapStatusStyle}>{text.loading}</div>}
        {activitiesError && (
          <div role="status" style={mapStatusStyle}>{text.loadFailed}</div>
        )}
        {activityNotice && (
          <div role="status" style={mapStatusStyle}>{activityNotice}</div>
        )}
      </div>
      <MarkerClusterGroup chunkedLoading>
        {currentUser && (
          <Marker
            key="self-pin"
            position={[location.lat, location.lng]}
            icon={createProfileIcon(currentUser, gridVisible, true, isOnline(currentUser.last_seen), profileImageLabel)}
            eventHandlers={{ click: () => onSelectProfile(currentUser) }}
          />
        )}
        {users.map((user) => {
          if (typeof user.lat !== 'number' || typeof user.lng !== 'number') return null;
          return (
            <Marker
              key={user.id}
              position={[user.lat, user.lng]}
              icon={createProfileIcon(user, user.grid_visible !== false, false, isOnline(user.last_seen), profileImageLabel)}
              eventHandlers={{ click: () => onSelectProfile(user) }}
            />
          );
        })}
        {parties.map((party) => (
          <Marker
            key={`party-${party.id}`}
            position={[party.lat, party.lng]}
            icon={createPartyIcon(party.host)}
            eventHandlers={{ click: () => {
              setSelectedParty(party);
              setDialog('party-details');
              setActivityNotice('');
            } }}
          />
        ))}
        {cruisingSpots.map((spot) => (
          <Marker
            key={`cruising-spot-${spot.id}`}
            position={[spot.lat, spot.lng]}
            icon={createCruisingSpotIcon(spot.status === 'confirmed')}
            eventHandlers={{ click: () => {
              setSelectedSpot(spot);
              setDialog('spot-details');
              setActivityNotice('');
            } }}
          />
        ))}
      </MarkerClusterGroup>
      {dialog && (
        <div
          role="presentation"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={closeDialog}
          style={{
            position: 'absolute',
            zIndex: 1600,
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0,0,0,0.72)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-activity-dialog-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(100%, 440px)',
              maxHeight: 'min(88vh, 740px)',
              overflowY: 'auto',
              padding: '18px',
              borderRadius: '14px',
              border: '1px solid #444',
              background: '#171717',
              color: '#f9fafb',
              boxShadow: '0 12px 40px rgba(0,0,0,0.65)',
            }}
          >
            <h2 id="map-activity-dialog-title" style={{ margin: '0 0 12px', fontSize: '18px' }}>
              {dialog === 'host-prompt' ? text.promptTitle
                : dialog === 'party-form' ? text.formTitle
                : dialog === 'party-details' ? text.partyDetails
                  : dialog === 'report' ? reportText.report
                    : dialog === 'admin-reports' ? reportText.reviewReports
                      : text.spotTitle}
            </h2>
            {dialog === 'host-prompt' && (
              <>
                <p style={mapDialogTextStyle}>{text.promptText}</p>
                <p style={mapDialogTextStyle}>{text.pinPrivacy}</p>
                <div style={mapDialogActionsStyle}>
                  <button
                    type="button"
                    onClick={() => {
                      setPartyForm({
                        durationHours: '2',
                        maxPeople: '4',
                        soughtRoles: [],
                        joinCostStars: '0',
                        note: '',
                      });
                      setDialog('party-form');
                    }}
                    style={mapPrimaryButtonStyle}
                  >
                    {text.yes}
                  </button>
                  <button type="button" onClick={closeDialog} style={mapSecondaryButtonStyle}>
                    {text.cancel}
                  </button>
                </div>
              </>
            )}
            {dialog === 'party-form' && (
              <form onSubmit={(event) => void publishParty(event)} style={{ display: 'grid', gap: '11px' }}>
                <label style={mapFieldStyle}>
                  <span>{text.duration}</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    required
                    value={partyForm.durationHours}
                    onChange={(event) => setPartyForm((value) => ({ ...value, durationHours: event.target.value }))}
                    style={mapInputStyle}
                  />
                </label>
                <label style={mapFieldStyle}>
                  <span>{text.maxPeople}</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={partyForm.maxPeople}
                    onChange={(event) => setPartyForm((value) => ({ ...value, maxPeople: event.target.value }))}
                    style={mapInputStyle}
                  />
                  <small style={mapHintStyle}>{text.includingSelf}</small>
                </label>
                <fieldset style={{ border: '1px solid #3f3f46', borderRadius: '8px', padding: '9px 10px' }}>
                  <legend style={{ padding: '0 4px', fontSize: '13px' }}>{text.roles}</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                    {['Top', 'Versatile', 'Bottom', 'Side'].map((role) => (
                      <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={partyForm.soughtRoles.includes(role)}
                          onChange={() => updateRole(role)}
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                  <small style={mapHintStyle}>{text.rolesShownOnly}</small>
                </fieldset>
                <label style={mapFieldStyle}>
                  <span>{text.cost}</span>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    required
                    value={partyForm.joinCostStars}
                    onChange={(event) => setPartyForm((value) => ({ ...value, joinCostStars: event.target.value }))}
                    style={mapInputStyle}
                  />
                  <small style={mapHintStyle}>{text.joinCostHint}</small>
                </label>
                <label style={mapFieldStyle}>
                  <span>{text.note}</span>
                  <textarea
                    rows={3}
                    maxLength={300}
                    placeholder={text.notePlaceholder}
                    value={partyForm.note}
                    onChange={(event) => setPartyForm((value) => ({ ...value, note: event.target.value }))}
                    style={{ ...mapInputStyle, resize: 'vertical' }}
                  />
                </label>
                <div style={{ ...mapDialogTextStyle, margin: 0 }}>
                  {text.postFee}: {effectivePostPrice === 0 ? text.free : `${effectivePostPrice} ⭐`}
                </div>
                <p style={mapHintStyle}>{text.pinPrivacy}</p>
                {activityNotice && <div role="alert" style={mapAlertStyle}>{activityNotice}</div>}
                <div style={mapDialogActionsStyle}>
                  <button type="submit" disabled={activityBusy} style={mapPrimaryButtonStyle}>
                    {activityBusy ? text.posting : text.post}
                  </button>
                  <button type="button" disabled={activityBusy} onClick={closeDialog} style={mapSecondaryButtonStyle}>
                    {text.cancel}
                  </button>
                </div>
              </form>
            )}
            {dialog === 'party-details' && selectedParty && (
              <div style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {selectedParty.host.avatar && safeAvatarUrl(selectedParty.host.avatar) ? (
                    <img
                      src={safeAvatarUrl(selectedParty.host.avatar) || undefined}
                      alt={selectedParty.host.name || profileImageLabel}
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div aria-hidden="true" style={{ ...mapInitialStyle, width: 48, height: 48 }}>
                      {selectedParty.host.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  <strong>{selectedParty.host.name || 'Anonymous'}</strong>
                </div>
                <div style={mapDialogTextStyle}>{text.expires}: {formatDate(selectedParty.expiresAt)}</div>
                <div style={mapDialogTextStyle}>{text.people}: {selectedParty.maxPeople}</div>
                <div style={mapDialogTextStyle}>{text.roles}: {selectedParty.soughtRoles.join(', ')}</div>
                <div style={mapDialogTextStyle}>
                  {text.joinCost}: {selectedParty.joinCostStars === 0
                    ? text.free
                    : `${selectedParty.joinCostStars.toLocaleString(lang)} ⭐`}
                </div>
                <small style={mapHintStyle}>{text.joinCostHint}</small>
                {selectedParty.note && <p style={{ ...mapDialogTextStyle, whiteSpace: 'pre-wrap' }}>{selectedParty.note}</p>}
                <div style={mapDialogActionsStyle}>
                  {selectedParty.isMine ? (
                    <button type="button" disabled={activityBusy} onClick={() => void endParty()} style={mapPrimaryButtonStyle}>
                      {activityBusy ? text.endingParty : text.endParty}
                    </button>
                  ) : selectedParty.host.username ? (
                    <button type="button" onClick={openHostChat} style={mapPrimaryButtonStyle}>
                      {text.sendMessage}
                    </button>
                  ) : (
                    <button type="button" disabled style={{ ...mapSecondaryButtonStyle, opacity: 0.65 }}>
                      {text.usernameMissing}
                    </button>
                  )}
                  {!selectedParty.isMine && (
                    <button type="button" onClick={openReportDialog} style={mapSecondaryButtonStyle}>
                      {reportText.report}
                    </button>
                  )}
                  <button type="button" onClick={closeDialog} style={mapSecondaryButtonStyle}>{text.close}</button>
                </div>
              </div>
            )}
            {dialog === 'spot-details' && selectedSpot && (
              <>
                <p style={mapDialogTextStyle}>
                  {selectedSpot.status === 'confirmed' ? text.spotVerified : text.spotQuestion}
                </p>
                {selectedSpot.status === 'provisional' && (
                  <>
                    <p style={mapDialogTextStyle}>{formatSpotVotes(selectedSpot.yesVotes)}</p>
                    <p style={mapHintStyle}>{text.spotExpired}</p>
                    {selectedSpot.isMine && <p style={mapDialogTextStyle}>{text.spotWait}</p>}
                    {selectedSpot.hasVoted && <p style={mapDialogTextStyle}>{text.spotVoted}</p>}
                  </>
                )}
                <div style={mapDialogActionsStyle}>
                  {selectedSpot.canVote && (
                    <>
                      <button type="button" disabled={activityBusy} onClick={() => void voteForSpot(true)} style={mapPrimaryButtonStyle}>
                        {activityBusy ? text.confirm : text.spotYes}
                      </button>
                      <button type="button" disabled={activityBusy} onClick={() => void voteForSpot(false)} style={mapSecondaryButtonStyle}>
                        {text.spotNo}
                      </button>
                    </>
                  )}
                  {!selectedSpot.isMine && (
                    <button type="button" onClick={openReportDialog} style={mapSecondaryButtonStyle}>
                      {reportText.report}
                    </button>
                  )}
                  <button type="button" disabled={activityBusy} onClick={closeDialog} style={mapSecondaryButtonStyle}>
                    {text.close}
                  </button>
                </div>
              </>
            )}
            {dialog === 'report' && (
              <form onSubmit={(event) => { event.preventDefault(); void submitActivityReport(); }} style={{ display: 'grid', gap: '12px' }}>
                <label style={mapFieldStyle}>
                  <span>{reportText.reason}</span>
                  <select value={reportReason} onChange={(event) => setReportReason(event.target.value as MapActivityReport['reason'])} style={mapInputStyle}>
                    {Object.entries(reportText.reasonOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label style={mapFieldStyle}>
                  <span>{reportText.details}</span>
                  <textarea rows={3} maxLength={280} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} style={{ ...mapInputStyle, resize: 'vertical' }} />
                </label>
                <div style={mapDialogActionsStyle}>
                  <button type="submit" disabled={reportBusy} style={mapPrimaryButtonStyle}>{reportBusy ? reportText.reporting : reportText.submitReport}</button>
                  <button type="button" disabled={reportBusy} onClick={closeDialog} style={mapSecondaryButtonStyle}>{text.cancel}</button>
                </div>
              </form>
            )}
            {dialog === 'admin-reports' && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>{reportText.reportQueue}</h3>
                {adminReports.filter((report) => report.status === 'open').length === 0 && <p style={mapDialogTextStyle}>{reportText.noReports}</p>}
                {adminReports.filter((report) => report.status === 'open').map((report) => (
                  <article key={report.id} style={{ display: 'grid', gap: '7px', padding: '10px', border: '1px solid #444', borderRadius: '9px' }}>
                    <strong>{reportText.reasonOptions[report.reason]} · {report.activity_type === 'party' ? text.partyDetails : text.spotTitle}</strong>
                    <small style={mapHintStyle}>{report.target_id} · {new Date(report.created_at).toLocaleString()}</small>
                    <small style={mapHintStyle}>Reporter: {report.reporter_profile_id}</small>
                    {report.targetSummary && (
                      <small style={mapHintStyle}>
                        {report.targetSummary.note || report.targetSummary.status || ''}
                        {report.targetSummary.moderation_status ? ` · ${report.targetSummary.moderation_status}` : ''}
                      </small>
                    )}
                    {report.details && <p style={{ ...mapDialogTextStyle, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.details}</p>}
                    <div style={{ ...mapDialogActionsStyle, justifyContent: 'flex-start' }}>
                      <button type="button" disabled={reportBusy} onClick={() => void reviewReport(report, 'dismiss')} style={mapSecondaryButtonStyle}>{reportText.dismiss}</button>
                      <button type="button" disabled={reportBusy} onClick={() => void reviewReport(report, 'hide')} style={mapSecondaryButtonStyle}>{reportText.hidePin}</button>
                      <button type="button" disabled={reportBusy} onClick={() => void reviewReport(report, 'remove')} style={{ ...mapSecondaryButtonStyle, borderColor: '#b91c1c' }}>{reportText.removePin}</button>
                    </div>
                  </article>
                ))}
                <h3 style={{ margin: '4px 0 0', fontSize: '15px' }}>{reportText.auditTrail}</h3>
                {moderationEvents.length === 0 && <small style={mapHintStyle}>{reportText.noReports}</small>}
                {moderationEvents.slice(0, 30).map((item) => (
                  <div key={item.id} style={{ padding: '8px', borderRadius: '7px', background: '#242424', overflowWrap: 'anywhere' }}>
                    <strong>{item.action} · {item.activity_type}</strong>
                    <small style={{ display: 'block', color: '#aaa' }}>{item.target_id} · {new Date(item.created_at).toLocaleString()} · {item.admin_profile_id}</small>
                    {item.note && <small style={{ color: '#ccc' }}>{item.note}</small>}
                  </div>
                ))}
                <div style={mapDialogActionsStyle}>
                  <button type="button" disabled={reportBusy} onClick={closeDialog} style={mapSecondaryButtonStyle}>{text.close}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </MapContainer>
  );
}

const mapActionButtonStyle = (background: string): CSSProperties => ({
  padding: '9px 11px',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '9px',
  background,
  color: '#fff',
  fontWeight: 700,
  fontSize: '13px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
  cursor: 'pointer',
  pointerEvents: 'auto',
});

const mapStatusStyle: CSSProperties = {
  maxWidth: 'min(330px, calc(100vw - 32px))',
  padding: '7px 9px',
  borderRadius: '7px',
  background: 'rgba(17,24,39,0.95)',
  color: '#f9fafb',
  fontSize: '11px',
  lineHeight: 1.35,
  pointerEvents: 'auto',
};

const mapDialogTextStyle: CSSProperties = {
  margin: '0',
  color: '#e5e7eb',
  fontSize: '14px',
  lineHeight: 1.45,
};

const mapDialogActionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '8px',
};

const mapFieldStyle: CSSProperties = {
  display: 'grid',
  gap: '5px',
  color: '#f3f4f6',
  fontSize: '13px',
};

const mapInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px',
  border: '1px solid #52525b',
  borderRadius: '7px',
  background: '#111827',
  color: '#fff',
  font: 'inherit',
};

const mapHintStyle: CSSProperties = {
  margin: '2px 0 0',
  color: '#9ca3af',
  fontSize: '11px',
  lineHeight: 1.4,
};

const mapAlertStyle: CSSProperties = {
  padding: '8px',
  borderRadius: '7px',
  background: '#431407',
  color: '#fed7aa',
  fontSize: '12px',
};

const mapPrimaryButtonStyle: CSSProperties = {
  padding: '9px 12px',
  border: '1px solid #2563eb',
  borderRadius: '7px',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const mapSecondaryButtonStyle: CSSProperties = {
  padding: '9px 12px',
  border: '1px solid #52525b',
  borderRadius: '7px',
  background: '#27272a',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const mapInitialStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: '50%',
  background: '#0088cc',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 700,
};
