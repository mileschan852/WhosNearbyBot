export interface RequestedLocation {
  lat: number;
  lng: number;
}

export interface RequestLocationAccessOptions {
  positionTimeoutMs?: number;
  watchdogTimeoutMs?: number;
  maximumAgeMs?: number;
}

export function requestLocationAccess(
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null | undefined,
  options?: RequestLocationAccessOptions,
): Promise<RequestedLocation | null>;

export function isLocationSaveConfirmed(
  response: unknown,
  requestedLocation: RequestedLocation,
): boolean;
