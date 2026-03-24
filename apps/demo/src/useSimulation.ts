import { useEffect, useRef } from 'react';
import type { InboxTicket, SimTicketEntry } from './inbox-data';
import { SIM_TICKETS } from './inbox-data';

const INTERVALS: Record<'slow' | 'med' | 'fast', number> = {
  slow: 8000,
  med:  3000,
  fast: 1000,
};

export function useSimulation({
  speed,
  isRunning,
  onTick,
}: {
  speed: 'slow' | 'med' | 'fast';
  isRunning: boolean;
  onTick: (ticket: InboxTicket) => void;
}): void {
  const indexRef = useRef(0);
  // Stable ref so the interval closure always calls the latest onTick
  const onTickRef = useRef(onTick);
  useEffect(() => { onTickRef.current = onTick; });

  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      const entry: SimTicketEntry = SIM_TICKETS[indexRef.current % SIM_TICKETS.length];
      indexRef.current += 1;

      const ticket: InboxTicket = {
        ticketId: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        subject: entry.subject,
        body: entry.body,
        from: entry.from,
        submittedAt: new Date().toISOString(),
        status: 'processing',
      };
      onTickRef.current(ticket);
    }, INTERVALS[speed]);

    return () => clearInterval(id);
  }, [speed, isRunning]);
}
