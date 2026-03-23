import React, { useState } from 'react';
import { Button } from '@zendeskgarden/react-buttons';
import { Modal, Header, Body as ModalBody, Footer as ModalFooter, Close } from '@zendeskgarden/react-modals';
import { Paragraph } from '@zendeskgarden/react-typography';

interface Action {
  id: string;
  label: string;
  description: string;
}

const ACTIONS: Action[] = [
  { id: 'payment_status', label: 'Check Payment Status', description: 'Look up current payment status and estimated arrival from Reap Pay.' },
  { id: 'transaction_lookup', label: 'Look Up Transaction', description: 'Search transaction by reference number, amount, or date range.' },
  { id: 'kyc_status', label: 'Check KYC Status', description: 'Retrieve current KYC verification state for this customer.' },
  { id: 'freeze_card', label: 'Freeze / Unfreeze Card', description: 'Freeze or unfreeze a Reap Card. This action is logged to the audit trail.' },
  { id: 'escalate', label: 'Escalate to Engineering', description: 'Create a Jira ticket with full context and notify on-call.' },
];

export function ActionsPanel() {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);

  const handleConfirm = (action: Action) => {
    // Phase 5 will implement actual Reap API calls
    console.log(`Action confirmed: ${action.id} (Phase 5 Reap API integration pending)`);
    setPendingAction(null);
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <Paragraph style={{ color: '#68737d', fontSize: '12px', marginBottom: '12px' }}>
        These runbook actions will connect to Reap APIs in Phase 5. Confirming now logs the intent only.
      </Paragraph>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ACTIONS.map(action => (
          <Button
            key={action.id}
            size="small"
            isBasic
            onClick={() => setPendingAction(action)}
            style={{ justifyContent: 'flex-start' }}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {pendingAction && (
        <Modal onClose={() => setPendingAction(null)}>
          <Header>{pendingAction.label}</Header>
          <ModalBody>
            <Paragraph>{pendingAction.description}</Paragraph>
            <Paragraph style={{ color: '#d97c00', marginTop: '8px' }}>
              Phase 5 integration pending — confirmation will be logged to audit trail only.
            </Paragraph>
          </ModalBody>
          <ModalFooter>
            <Button size="small" onClick={() => setPendingAction(null)}>Cancel</Button>
            <Button size="small" isPrimary onClick={() => handleConfirm(pendingAction)} style={{ marginLeft: '8px' }}>
              Confirm
            </Button>
          </ModalFooter>
          <Close aria-label="Close modal" />
        </Modal>
      )}
    </div>
  );
}
