import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { mockZAFClient } from './mock-zaf-client';
import { DemoApp } from './DemoApp';
import { DashboardPage } from './DashboardPage';

// Must be set before DemoApp renders — ClientProvider reads ZAFClient.init() in useState()
(window as unknown as Record<string, unknown>).ZAFClient = mockZAFClient;

function Root() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash === '#/dashboard') return <DashboardPage />;
  return <DemoApp />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
