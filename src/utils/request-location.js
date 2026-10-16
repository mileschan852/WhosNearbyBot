const DEFAULT_POSITION_TIMEOUT_MS = 12_000;
const DEFAULT_WATCHDOG_TIMEOUT_MS = 14_000;
const DEFAULT_MAXIMUM_AGE_MS = 60_000;

function isValidCoordinate(value, min, max) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;
}

export function isLocationSaveConfirmed(response, requestedLocation) {
  const savedProfile = response?.profile;
  const savedLat = savedProfile?.lat;
  const savedLng = savedProfile?.lng;

  return response?.updated === true &&
    isValidCoordinate(requestedLocation?.lat, -90, 90) &&
    isValidCoordinate(requestedLocation?.lng, -180, 180) &&
    isValidCoordinate(savedLat, -90, 90) &&
    isValidCoordinate(savedLng, -180, 180) &&
    Math.abs(savedLat - requestedLocation.lat) <= 0.000001 &&
    Math.abs(savedLng - requestedLocation.lng) <= 0.000001;
}

export function requestLocationAccess(
  geolocation,
  {
    positionTimeoutMs = DEFAULT_POSITION_TIMEOUT_MS,
    watchdogTimeoutMs = DEFAULT_WATCHDOG_TIMEOUT_MS,
    maximumAgeMs = DEFAULT_MAXIMUM_AGE_MS,
  } = {},
) {
  return new Promise((resolve) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      resolve(null);
      return;
    }

    let settled = false;
    let watchdogTimer;
    const finish = (location) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdogTimer);
      resolve(location);
    };

    watchdogTimer = setTimeout(() => finish(null), watchdogTimeoutMs);
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const latitude = position?.coords?.latitude;
          const longitude = position?.coords?.longitude;
          if (!isValidCoordinate(latitude, -90, 90) ||
              !isValidCoordinate(longitude, -180, 180)) {
            finish(null);
            return;
          }
          finish({ lat: latitude, lng: longitude });
        },
        () => finish(null),
        {
          enableHighAccuracy: false,
          timeout: positionTimeoutMs,
          maximumAge: maximumAgeMs,
        },
      );
    } catch {
      finish(null);
    }
  });
}
