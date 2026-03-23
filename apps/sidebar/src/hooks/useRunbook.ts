import { useState, useCallback } from 'react';
import { useClient } from '../contexts/ClientProvider';

interface RunbookState {
  loading: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
}

export function useRunbook(ticketId: string | null) {
  const client = useClient();
  const [state, setState] = useState<RunbookState>({ loading: false, result: null, error: null });

  const execute = useCallback(async (
    runbookId: string,
    params: Record<string, unknown> = {},
  ) => {
    if (!ticketId || !client) return;
    setState({ loading: true, result: null, error: null });
    try {
      const response = await client.request({
        url: '{{setting.api_base_url}}/runbooks/' + runbookId,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ ticketId, params }),
      });
      setState({ loading: false, result: response as Record<string, unknown>, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Runbook failed';
      setState({ loading: false, result: null, error: msg });
    }
  }, [client, ticketId]);

  const reset = useCallback(() => {
    setState({ loading: false, result: null, error: null });
  }, []);

  return { ...state, execute, reset };
}
