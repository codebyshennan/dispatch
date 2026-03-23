import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeProvider, DEFAULT_THEME } from '@zendeskgarden/react-theming';

// ZAFClient is loaded as a global from iframe.html blocking script
declare const ZAFClient: {
  init: () => ZAFClientInstance;
};

export interface ZAFClientInstance {
  context: () => Promise<{ ticketId: string }>;
  get: (paths: string | string[]) => Promise<Record<string, unknown>>;
  invoke: (name: string, ...args: unknown[]) => Promise<unknown>;
  request: (options: ZAFRequestOptions) => Promise<unknown>;
  on: (event: string, handler: (data: unknown) => void) => void;
  off: (event: string, handler: (data: unknown) => void) => void;
}

export interface ZAFRequestOptions {
  url: string;
  type: 'GET' | 'POST' | 'PUT' | 'DELETE';
  contentType?: string;
  data?: string;
  headers?: Record<string, string>;
}

const ClientContext = createContext<ZAFClientInstance | null>(null);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  // Read colorScheme BEFORE ZAFClient.init() — URL params may not survive init
  const initialScheme = (new URLSearchParams(window.location.search).get('colorScheme') as 'light' | 'dark') ?? 'light';
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(initialScheme);

  // ZAFClient.init() called exactly once via useState initializer
  const [client] = useState<ZAFClientInstance>(() => ZAFClient.init());

  useEffect(() => {
    const handler = (scheme: unknown) => setColorScheme(scheme as 'light' | 'dark');
    client.on('colorScheme.changed', handler);
    return () => client.off('colorScheme.changed', handler);
  }, [client]);

  return (
    <ClientContext.Provider value={client}>
      <ThemeProvider theme={{ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, base: colorScheme === 'dark' ? 'dark' : 'light' } }}>
        {children}
      </ThemeProvider>
    </ClientContext.Provider>
  );
}

export function useClient(): ZAFClientInstance {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient must be used inside ClientProvider');
  return client;
}
