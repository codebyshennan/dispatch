import { useEffect, useState } from 'react';
import { useClient } from '../contexts/ClientProvider';

export interface ZendeskContext {
  requesterName: string;
  requesterEmail: string;
  orgName: string;
  status: string;
  tags: string[];
}

export function useContextData(): { context: ZendeskContext | null; contextLoading: boolean } {
  const client = useClient();
  const [context, setContext] = useState<ZendeskContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  useEffect(() => {
    client.get([
      'ticket.requester.name',
      'ticket.requester.email',
      'ticket.organization.name',
      'ticket.status',
      'ticket.tags',
    ]).then((data) => {
      setContext({
        requesterName: (data['ticket.requester.name'] as string) ?? '',
        requesterEmail: (data['ticket.requester.email'] as string) ?? '',
        orgName: (data['ticket.organization.name'] as string) ?? 'N/A',
        status: (data['ticket.status'] as string) ?? '',
        tags: (data['ticket.tags'] as string[]) ?? [],
      });
      setContextLoading(false);
    }).catch(() => setContextLoading(false));
  }, [client]);

  return { context, contextLoading };
}
