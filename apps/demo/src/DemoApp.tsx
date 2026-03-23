import React, { useState } from 'react';
import { ClientProvider } from '../../sidebar/src/contexts/ClientProvider';
import { IntelligencePanel } from '../../sidebar/src/panels/IntelligencePanel';
import { InputPanel, type QueryEntry } from './InputPanel';
import { setTicketId } from './mock-zaf-client';

export function DemoApp() {
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = (ticketId: string, entry: QueryEntry) => {
    setTicketId(ticketId);
    setCurrentTicketId(ticketId);
    setLoading(false);
    setHistory(prev => {
      // Deduplicate by ticketId
      const exists = prev.find(e => e.ticketId === ticketId);
      return exists ? prev : [...prev, entry];
    });
  };

  const handleSubmitStart = () => setLoading(true);

  return (
    <ClientProvider>
      <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        {/* Left: input panel — fixed width */}
        <div style={{ width: '360px', borderRight: '1px solid #e0e0e0', overflowY: 'auto' }}>
          <InputPanel
            onAnalyze={handleAnalyze}
            onSubmitStart={handleSubmitStart}
            history={history}
            activeTicketId={currentTicketId}
            loading={loading}
          />
        </div>

        {/* Right: IntelligencePanel — remounts on each new ticketId so hooks re-fire */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {currentTicketId
            ? <IntelligencePanel key={currentTicketId} />
            : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#68737d' }}>
                Submit a ticket to see AI analysis
              </div>
            )
          }
        </div>
      </div>
    </ClientProvider>
  );
}
