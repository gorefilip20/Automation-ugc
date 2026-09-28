# Growth OS crawl review and Slack notifications

## Standard crawl

The Growth OS crawler uses the standard profile:

- Same-domain public pages only
- `robots.txt` respected
- Maximum depth: 4
- Maximum pages: 100
- Request timeout: 9 seconds
- Small delay between pages to reduce load
- No login, paywall, CAPTCHA, or private-area bypassing

Every email candidate stores its source URL. Verification is layered:

1. Syntax
2. MX lookup
3. SMTP `EHLO` / `MAIL FROM` / `RCPT TO` probe

No email message is sent. SMTP providers can still return inconclusive results because of greylisting, catch-all behavior, privacy protections, or recipient probing defenses. Treat `unknown`, `risky`, and `catch_all` as review states, not as confirmed invalid addresses.

## Slack adapter

Create a Slack Incoming Webhook for the review channel and set these server-side variables:

```bash
SLACK_REVIEW_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_REVIEW_WEBHOOK_SECRET=optional-shared-signing-secret
VERIFICATION_MAIL_FROM=probe@your-owned-domain.example
```

`SLACK_REVIEW_WEBHOOK_URL` is never exposed to the client. When a crawl reaches `ready`, the worker sends a `review.ready` Slack message with:

- Domain
- Pages crawled and discovered
- Total email candidates
- Likely-valid count
- Unknown/risky count
- Crawl job ID

Delivery is recorded in `webhook_deliveries`, retried up to three times with backoff, and marked `delivered` or `failed`.

The optional `SLACK_REVIEW_WEBHOOK_SECRET` creates an HMAC signature in the `x-growth-os-signature` header and is included as a short reference in the Slack context line.

## Review route

After starting a crawl from Growth OS, the app opens:

```text
/growth-os/review/:jobId
```

The screen polls the crawl job and displays:

- Queued → Crawling → Extracting → Verifying → Ready
- Page progress
- Email verification breakdown
- Per-email status and source URL
- Recent crawl sources
- Slack delivery state

## Operational note

The current worker runs in the API process for the prototype. For production, run it as a persistent background worker or managed queue process so crawls continue through API restarts and can be retried independently. The database tables are already separated so that worker can be moved without changing the review UI contract.
