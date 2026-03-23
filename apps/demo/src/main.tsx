import React from 'react';
import ReactDOM from 'react-dom/client';
import { mockZAFClient } from './mock-zaf-client';
import { DemoApp } from './DemoApp';

// Must be set before DemoApp renders — ClientProvider reads ZAFClient.init() in useState()
(window as unknown as Record<string, unknown>).ZAFClient = mockZAFClient;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>,
);
