import { useState, useEffect } from 'react';
import { useClient } from '../contexts/ClientProvider';

export function useTicketId(): string | null {
  const client = useClient();
  const [ticketId, setTicketId] = useState<string | null>(null);

  useEffect(() => {
    client.context().then(ctx => setTicketId(String(ctx.ticketId)));
  }, [client]);

  return ticketId;
}
