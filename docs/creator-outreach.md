# Automated creator outreach sequences

Feature 2 adds an approval-gated creator outreach workspace to Growth OS.

## Workflow

1. Create a sequence brief with the brand, product, category, value proposition, offer, sender identity, and daily limit.
2. Select shortlisted creators from Creator CRM.
3. Generate personalized first-touch drafts using creator name, handle, niche, brand, product, value proposition, and offer.
4. Review individual message previews.
5. Explicitly approve selected drafts.
6. Queue and deliver through the configured delivery adapter.
7. Track sent, replied, bounced, failed, and opted-out states.

The default delivery adapter is a safe simulated adapter. It creates provider-like message and thread IDs without sending real email. A production adapter can implement the same `DeliveryAdapter` interface for an approved transactional email provider.

## Reply tracking

Providers can POST to `/api/outreach/webhook` with either:

```json
{"type":"reply","threadId":"provider-thread-id","providerEventId":"event-id","body":"Reply text"}
```

or:

```json
{"type":"unsubscribe","email":"creator@example.com"}
```

When `OUTREACH_WEBHOOK_SECRET` is configured, providers must include the matching `x-outreach-webhook-secret` header. Replies update the outreach record and create a Creator CRM activity. Unsubscribe events create a suppression record and mark matching outreach as `opted_out`.

## Safety and compliance boundaries

- Drafts begin in `draft` state.
- Only explicitly approved drafts become `queued`.
- Suppressed emails are never sent.
- Every message includes an unsubscribe instruction.
- Creator discovery contactability is not treated as consent to outreach.
- The simulated adapter must be replaced with a compliant provider adapter before production sending.

## Validation

Run:

```bash
npm run db:migrate
npm run test:outreach
npm run build
```

The test covers personalized draft creation, unsubscribe footer inclusion, approval, simulated delivery, thread creation, reply matching, suppression, and cleanup.
