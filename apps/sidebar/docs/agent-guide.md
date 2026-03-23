# Meridian Copilot — CX Agent Guide

## What is Meridian Copilot?

Meridian Copilot is an AI assistant embedded directly in your Zendesk sidebar. When you open a ticket, Meridian analyses the customer's message and shows you their context, a suggested draft reply, and relevant Help Center articles — all without leaving Zendesk. You are always in control: Meridian suggests, you decide. Nothing is sent or changed until you click Submit.

---

## How to Access Meridian

Meridian opens automatically as a sidebar panel when you open any ticket in Zendesk Agent Workspace.

If it does not appear:
- Look for **"Meridian Copilot"** in the Apps panel on the right side of the ticket view.
- Click the app name to expand it.
- If it still does not load, contact the tech team (see Getting Help below).

---

## The Three Panels

### Panel 1: Context Tab

The Context tab shows you the basic customer profile for the current ticket:

- Customer name, email, and organisation
- Current ticket status and priority tags
- Any previous tickets from the same customer

**Coming in a future release:** Reap account details including KYC verification status, products held, and recent transactions — so you will have the full picture without switching to an internal dashboard.

---

### Panel 2: Intelligence Tab

This is the most important panel. It gives you the AI analysis and suggested draft for the current ticket.

**Classification card**

Meridian categorises every ticket and assigns an urgency level:

| Badge colour | Urgency | Meaning |
|---|---|---|
| Red | P1 — Urgent | Respond within 1 hour |
| Orange | P2 — High | Respond within 4 hours |
| Blue | P3 — Normal | Standard SLA |
| Grey | P4 — Low | Respond when capacity allows |

A confidence percentage is shown next to the badge (e.g. "92% confident"). The higher the number, the more certain Meridian is about its classification.

**Compliance flags**

If any compliance flags appear in red, **do NOT send any response without manager review first.** These flags indicate the ticket may involve a regulatory, legal, or sensitive financial matter. Treat them as a hard stop.

**Draft response**

Meridian generates a suggested reply based on the ticket content and matching Help Center articles. The draft appears in an editable text area. You should:

1. Read the draft carefully.
2. Edit it to match your tone and any details Meridian may have missed.
3. Click **Insert Draft** to copy it into your Zendesk reply box.
4. Review once more, then click Submit as normal.

The Insert Draft button does not send the reply — it only places the text into your reply field so you can edit it before sending.

**KB References**

Below the draft, Meridian shows the top 3 Help Center articles it used to generate the response. Click any article title to open it in a new tab. These are useful for verifying the draft or finding additional detail.

**Feedback buttons**

After reviewing the draft, click thumbs up or thumbs down to rate it. You can add a short note explaining what was helpful or what should be improved. The team reviews feedback weekly to improve future drafts.

---

### Panel 3: Actions Tab

The Actions tab is coming in a future release. It will allow you to:

- Look up payment and transaction status
- Perform KYC checks
- Freeze a card
- Escalate a case to the engineering team

No actions are available in this tab yet — you will be notified when it launches.

---

## How to Provide Feedback

Feedback makes Meridian better. After reading any draft:

1. Click the **thumbs up** icon if the draft was accurate and helpful.
2. Click the **thumbs down** icon if the draft missed something, was off-tone, or incorrect.
3. Optionally, type a short note (e.g. "Draft assumed wrong currency" or "Missing card freeze step").

The tech team reviews all feedback every Thursday. Your input directly shapes the next set of improvements.

---

## What Meridian Does NOT Do

- **Never sends emails automatically.** Nothing leaves your queue until you click Submit.
- **Never modifies tickets, tags, or status** without you taking an action first.
- **Does not have access to Reap systems yet.** All customer detail comes from Zendesk only (Reap integration comes in a future release).
- **If Meridian shows "Analysis in progress"**, the AI is still processing — wait 60–90 seconds, then refresh the panel. If the issue persists, handle the ticket manually and flag it to the tech team.

---

## FAQ

**Q: The sidebar is blank or stuck loading. What do I do?**
Refresh the ticket page. If the issue continues, note the ticket ID and contact tech@reap.global.

**Q: The urgency badge seems wrong. Should I override it?**
Yes — you are the agent, not the AI. If you believe the ticket is more or less urgent than shown, act on your judgement and provide thumbs-down feedback so Meridian can learn.

**Q: A compliance flag appeared. What exactly should I do?**
Stop. Do not draft or send any reply. Escalate to your manager immediately with the ticket ID. The manager will review and advise on next steps.

**Q: Can I use Meridian on multiple tickets at the same time?**
Yes. Each ticket tab loads Meridian independently. Switching between tickets will update the sidebar automatically.

**Q: Will my feedback be anonymous?**
Feedback is tied to your Zendesk agent ID for quality purposes, but it is only reviewed by the tech team and CX lead — not shared publicly.

---

## Getting Help

- **Tech issues:** tech@reap.global
- **Office hours:** Every Thursday 3–4pm (held before each phase launch — check your calendar invite)
- **Urgent issues during a live shift:** Contact your team lead directly

---

*Meridian Copilot v1.0 — Phase 4 release. Last updated: March 2026.*
