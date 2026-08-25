import { useEffect, useRef } from 'react';
import { getToken } from './api';
import type { JobResponse } from './types';

/**
 * Subscribes to the backend's SSE job-update stream. EventSource can't set an Authorization
 * header, so the JWT is passed as a query param (validated manually server-side).
 */
export function useJobEvents(onJobUpdate: (job: JobResponse) => void) {
  const callbackRef = useRef(onJobUpdate);
  callbackRef.current = onJobUpdate;

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    const handler = (event: MessageEvent) => {
      try {
        callbackRef.current(JSON.parse(event.data) as JobResponse);
      } catch {
        // ignore malformed event
      }
    };
    source.addEventListener('job-update', handler);

    return () => {
      source.removeEventListener('job-update', handler);
      source.close();
    };
  }, []);
}
