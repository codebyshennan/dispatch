import React, { useState } from 'react';
import { Button } from '@zendeskgarden/react-buttons';
import { Modal, Header, Body as ModalBody, Footer as ModalFooter, Close } from '@zendeskgarden/react-modals';
import { Paragraph } from '@zendeskgarden/react-typography';
import { Field, Label, Input, Select } from '@zendeskgarden/react-forms';
import { Dots } from '@zendeskgarden/react-loaders';
import { Notification, Title } from '@zendeskgarden/react-notifications';
import { useRunbook } from '../hooks/useRunbook';

interface ActionsPanelProps {
  ticketId: string | null;
}

interface Action {
  id: string;
  label: string;
  description: string;
}

const ACTIONS: Action[] = [
  { id: 'payment_status', label: 'Check Payment Status', description: 'Look up current payment status and estimated arrival from Reap Pay.' },
  { id: 'transaction_search', label: 'Look Up Transaction', description: 'Search transaction by reference number, amount, or date range.' },
  { id: 'kyc_status', label: 'Check KYC Status', description: 'Retrieve current KYC verification state for this customer.' },
  { id: 'card_freeze', label: 'Freeze / Unfreeze Card', description: 'Freeze or unfreeze a Reap Card. This action is logged to the audit trail.' },
  { id: 'resend_notification', label: 'Resend Notification', description: 'Resend a payment notification via email or WhatsApp.' },
  { id: 'escalate', label: 'Escalate to Engineering', description: 'Create a Jira ticket with full context and notify on-call.' },
  { id: 'stablecoin_tracker', label: 'Stablecoin TX Tracker', description: 'Track a stablecoin transaction on-chain across Ethereum, Solana, Tron, or Polygon.' },
];

function ParamFields({
  actionId,
  params,
  onChange,
}: {
  actionId: string;
  params: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  switch (actionId) {
    case 'payment_status':
      return (
        <Field style={{ marginTop: '12px' }}>
          <Label>Payment ID</Label>
          <Input value={params.paymentId ?? ''} onChange={(e) => onChange('paymentId', e.target.value)} placeholder="e.g. PAY-12345" />
        </Field>
      );
    case 'transaction_search':
      return (
        <Field style={{ marginTop: '12px' }}>
          <Label>Reference Number</Label>
          <Input value={params.referenceNumber ?? ''} onChange={(e) => onChange('referenceNumber', e.target.value)} placeholder="e.g. TXN-98765" />
        </Field>
      );
    case 'kyc_status':
      return (
        <Field style={{ marginTop: '12px' }}>
          <Label>Customer ID</Label>
          <Input value={params.customerId ?? ''} onChange={(e) => onChange('customerId', e.target.value)} placeholder="e.g. CUST-11111" />
        </Field>
      );
    case 'card_freeze':
      return (
        <>
          <Field style={{ marginTop: '12px' }}>
            <Label>Card ID</Label>
            <Input value={params.cardId ?? ''} onChange={(e) => onChange('cardId', e.target.value)} placeholder="e.g. CARD-55555" />
          </Field>
          <Field style={{ marginTop: '8px' }}>
            <Label>Action</Label>
            <Select value={params.action ?? 'freeze'} onChange={(e) => onChange('action', e.target.value)}>
              <option value="freeze">Freeze</option>
              <option value="unfreeze">Unfreeze</option>
            </Select>
          </Field>
        </>
      );
    case 'resend_notification':
      return (
        <>
          <Field style={{ marginTop: '12px' }}>
            <Label>Payment ID</Label>
            <Input value={params.paymentId ?? ''} onChange={(e) => onChange('paymentId', e.target.value)} placeholder="e.g. PAY-12345" />
          </Field>
          <Field style={{ marginTop: '8px' }}>
            <Label>Channel</Label>
            <Select value={params.channel ?? 'email'} onChange={(e) => onChange('channel', e.target.value)}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </Select>
          </Field>
        </>
      );
    case 'escalate':
      return (
        <Field style={{ marginTop: '12px' }}>
          <Label>Reason</Label>
          <Input value={params.reason ?? ''} onChange={(e) => onChange('reason', e.target.value)} placeholder="Describe the issue for engineering" />
        </Field>
      );
    case 'stablecoin_tracker':
      return (
        <>
          <Field style={{ marginTop: '12px' }}>
            <Label>Transaction Hash</Label>
            <Input value={params.txHash ?? ''} onChange={(e) => onChange('txHash', e.target.value)} placeholder="e.g. 0xabc123..." />
          </Field>
          <Field style={{ marginTop: '8px' }}>
            <Label>Chain</Label>
            <Select value={params.chain ?? 'ethereum'} onChange={(e) => onChange('chain', e.target.value)}>
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="tron">Tron</option>
              <option value="polygon">Polygon</option>
            </Select>
          </Field>
        </>
      );
    default:
      return null;
  }
}

export function ActionsPanel({ ticketId }: ActionsPanelProps) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const { loading, result, error, execute, reset } = useRunbook(ticketId);

  const handleParamChange = (key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleOpen = (action: Action) => {
    setParams({});
    reset();
    setPendingAction(action);
  };

  const handleClose = () => {
    setPendingAction(null);
    setParams({});
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;
    await execute(pendingAction.id, params as Record<string, unknown>);
    setPendingAction(null);
    setParams({});
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ACTIONS.map(action => (
          <Button
            key={action.id}
            size="small"
            isBasic
            onClick={() => handleOpen(action)}
            style={{ justifyContent: 'flex-start' }}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {error && (
        <Notification type="error" style={{ marginTop: '12px' }}>
          <Title>Runbook Error</Title>
          {error}
        </Notification>
      )}

      {result && (
        <div style={{ marginTop: '12px', background: '#f8f9f9', border: '1px solid #d8dcde', borderRadius: '4px', padding: '8px' }}>
          <Paragraph style={{ fontSize: '11px', color: '#68737d', marginBottom: '4px', fontWeight: 600 }}>
            Result
          </Paragraph>
          <pre style={{ fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#2f3941' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {pendingAction && (
        <Modal onClose={handleClose}>
          <Header>{pendingAction.label}</Header>
          <ModalBody>
            <Paragraph>{pendingAction.description}</Paragraph>
            <ParamFields
              actionId={pendingAction.id}
              params={params}
              onChange={handleParamChange}
            />
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                <Dots size="32" />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button size="small" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button size="small" isPrimary onClick={handleConfirm} disabled={loading} style={{ marginLeft: '8px' }}>
              {loading ? 'Running…' : 'Confirm'}
            </Button>
          </ModalFooter>
          <Close aria-label="Close modal" />
        </Modal>
      )}
    </div>
  );
}
