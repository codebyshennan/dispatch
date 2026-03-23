import React, { useEffect, useRef } from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@zendeskgarden/react-tabs';
import { useClient } from './contexts/ClientProvider';
import { useTicketId } from './hooks/useTicketId';
import { ContextPanel } from './panels/ContextPanel';
import { IntelligencePanel } from './panels/IntelligencePanel';
import { ActionsPanel } from './panels/ActionsPanel';

export function App() {
  const client = useClient();
  const ticketId = useTicketId();
  const hasFiredTelemetry = useRef(false);

  // CHG-02: sidebar_viewed telemetry — fires when ticketId first becomes available
  // Using useEffect([ticketId]) ensures ticketId is always non-null in the event payload
  useEffect(() => {
    if (!ticketId || hasFiredTelemetry.current) return;
    hasFiredTelemetry.current = true;
    client.request({
      url: '{{setting.api_base_url}}/telemetry',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ ticketId, event: 'sidebar_viewed', ts: new Date().toISOString() }),
    }).catch(() => { /* non-blocking telemetry */ });
  }, [ticketId, client]);

  return (
    <div style={{ padding: '8px' }}>
      <Tabs>
        <TabList>
          <Tab item="context">Context</Tab>
          <Tab item="intelligence">Intelligence</Tab>
          <Tab item="actions">Actions</Tab>
        </TabList>
        <TabPanel item="context"><ContextPanel /></TabPanel>
        <TabPanel item="intelligence"><IntelligencePanel /></TabPanel>
        <TabPanel item="actions"><ActionsPanel /></TabPanel>
      </Tabs>
    </div>
  );
}
