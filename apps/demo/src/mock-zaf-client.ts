import type { ZAFClientInstance, ZAFRequestOptions } from '../../sidebar/src/contexts/ClientProvider';

// Module-level mutable state — fine for a demo
let currentTicketId = 'demo-init';

export function setTicketId(id: string): void {
  currentTicketId = id;
}

export const mockZAFClient: { init: () => ZAFClientInstance } = {
  init: () => ({
    context: () => Promise.resolve({ ticketId: currentTicketId }),

    request: ({ url, type, data, contentType }: ZAFRequestOptions) => {
      const actualUrl = url.replace('{{setting.api_base_url}}', 'http://localhost:3001');
      return fetch(actualUrl, {
        method: type,
        body: data,
        headers: contentType ? { 'Content-Type': contentType } : {},
      }).then(r => r.json());
    },

    get: () => Promise.resolve({}),
    invoke: () => Promise.resolve(undefined),
    on: () => {},
    off: () => {},
  }),
};
