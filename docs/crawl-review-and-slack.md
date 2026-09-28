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

## Verified leads in ad campaigns

Public discovery alone does not make a lead eligible for ad audience targeting. In the crawl review screen, a reviewer must mark an email as eligible after confirming the applicable consent or lawful basis. Only `verified` or `likely_valid` candidates with that flag are considered.

When the campaign launch panel enables **Add to campaign**, the deploy request requires a second confirmation that the selected leads may be used for advertising. Emails are normalized and SHA-256 hashed server-side; raw emails are never sent to Meta or Google. The existing campaign approval gate remains required and campaigns are created paused.

Meta creates a Custom Audience with `USER_PROVIDED_ONLY` and uploads hashed emails in batches. Google uses the current Data Manager API path for new Customer Match integrations. Configure the Google Data Manager variables in addition to the normal Google Ads campaign variables:

```bash
GOOGLE_DATA_MANAGER_ACCESS_TOKEN=optional-separate-oauth-token
GOOGLE_DATA_MANAGER_PARENT=accountTypes/GOOGLE_ADS/accounts/1234567890
GOOGLE_DATA_MANAGER_OPERATING_ACCOUNT_ID=1234567890
GOOGLE_DATA_MANAGER_OPERATING_ACCOUNT_TYPE=GOOGLE_ADS
GOOGLE_DATA_MANAGER_CUSTOMER_MATCH_TERMS_ACCEPTED=true
```

Google Customer Match terms must be accepted in the operating account. Audience creation and member ingestion are provider-side operations and may remain asynchronous or subject to account eligibility and policy review. The response includes the external audience ID so the next ad-set/ad-group creation step can attach it.

## Safe end-to-end simulation

Run `npm run test:ad-deployment` to exercise the real deployment service with an intercepted `fetch` implementation. The test simulates Meta Custom Audience creation, Meta member upload, Meta campaign creation, Google Data Manager audience creation, Google member ingestion, Google campaign-budget creation, and Google campaign creation. It also verifies that the consent gate rejects an unapproved audience request, raw email text is never transmitted, and the expected SHA-256 hash is present in the simulated provider payloads. No provider network request is made by this test.
