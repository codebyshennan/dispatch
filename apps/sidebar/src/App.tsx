import React from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@zendeskgarden/react-tabs';
import { Skeleton } from '@zendeskgarden/react-loaders';

// Panels will be implemented in Plan 04
// Using lazy placeholders here to keep this scaffold buildable immediately
function ContextPanel() {
  return <Skeleton width="100%" height="200px" />;
}

function IntelligencePanel() {
  return <Skeleton width="100%" height="200px" />;
}

function ActionsPanel() {
  return <Skeleton width="100%" height="200px" />;
}

export function App() {
  return (
    <div style={{ padding: '8px' }}>
      <Tabs>
        <TabList>
          <Tab item="context">Context</Tab>
          <Tab item="intelligence">Intelligence</Tab>
          <Tab item="actions">Actions</Tab>
        </TabList>
        <TabPanel item="context">
          <ContextPanel />
        </TabPanel>
        <TabPanel item="intelligence">
          <IntelligencePanel />
        </TabPanel>
        <TabPanel item="actions">
          <ActionsPanel />
        </TabPanel>
      </Tabs>
    </div>
  );
}
