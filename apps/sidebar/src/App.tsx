import React, { useEffect, useRef, useState } from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@zendeskgarden/react-tabs';
import { useClient } from './contexts/ClientProvider';
import { useTicketId } from './hooks/useTicketId';
import { ContextPanel } from './panels/ContextPanel';
import { IntelligencePanel } from './panels/IntelligencePanel';
import { ActionsPanel } from './panels/ActionsPanel';
import { NpsModal } from './components/NpsModal';

export function App() {
  const client = useClient();
  const ticketId = useTicketId();
  const hasFiredTelemetry = useRef(false);
  const [showNpsModal, setShowNpsModal] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);

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

  // CHG-04: Monthly NPS modal — show once per calendar month via localStorage guard
  useEffect(() => {
    const yearMonth = new Date().toISOString().slice(0, 7);
    const alreadyShown = localStorage.getItem(`nps_shown_${yearMonth}`);
    if (alreadyShown) return;

    // Fetch agent ID from ZAF client metadata
    client.get('currentUser.id').then((res: unknown) => {
      const userId = (res as Record<string, unknown>)['currentUser.id'];
      if (!userId) return;
      const id = String(userId);
      setAgentId(id);
      setShowNpsModal(true);
    }).catch(() => {
      // If agentId unavailable, skip NPS modal — don't block main sidebar load
    });
  }, [client]);

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
        <TabPanel item="actions"><ActionsPanel ticketId={ticketId} /></TabPanel>
      </Tabs>

      {/* CHG-04: NPS modal — rendered conditionally, once per calendar month */}
      {showNpsModal && agentId && (
        <NpsModal
          agentId={agentId}
          onClose={() => {
            setShowNpsModal(false);
            const yearMonth = new Date().toISOString().slice(0, 7);
            localStorage.setItem(`nps_shown_${yearMonth}`, 'true');
          }}
        />
      )}
    </div>
  );
}
