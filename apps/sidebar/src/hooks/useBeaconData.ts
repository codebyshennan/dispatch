import { useEffect, useState, useCallback } from 'react';
import { useClient } from '../contexts/ClientProvider';
import { useTicketId } from './useTicketId';
import type { SidebarPayload } from '@dispatch/core';

const MAX_POLLS = 6; // up to ~90s wait
const POLL_INTERVAL_MS = 10_000; // 10 seconds between polls

export function useBeaconData() {
  const client = useClient();
  const ticketId = useTicketId();
  const [data, setData] = useState<SidebarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (pollCount = 0) => {
    if (!ticketId) return;
    try {
      const response = await client.request({
        url: `{{setting.api_base_url}}/context/${ticketId}`,
        type: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }) as SidebarPayload;

      setData(response);
      setLoading(false);

      // Poll again if status is pending and we haven't exceeded max polls
      if (response.status === 'pending' && pollCount < MAX_POLLS) {
        setTimeout(() => fetchData(pollCount + 1), POLL_INTERVAL_MS);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
      setLoading(false);
    }
  }, [client, ticketId]);

  useEffect(() => {
    if (ticketId) {
      setLoading(true);
      fetchData(0);
    }
  }, [ticketId, fetchData]);

  return { data, loading, error, ticketId };
}
