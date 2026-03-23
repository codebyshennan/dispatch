import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClientProvider } from './contexts/ClientProvider';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <React.StrictMode>
    <ClientProvider>
      <App />
    </ClientProvider>
  </React.StrictMode>
);
