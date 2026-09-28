# Growth OS analytics reporting

Growth OS now records each paused Meta or Google deployment, generates a tracked destination URL with `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content`, and stores provider performance as daily metric snapshots.

The reporting worker runs every 15 minutes while the API server is running. It pulls daily campaign insights from Meta and Google, normalizes the provider-specific responses into a common shape, and writes impressions, reach, clicks, spend, conversions, CTR, CPC, and the original provider row for auditability. The dashboard refreshes its summary every minute and shows the latest sync state.

Meta reporting uses the campaign Insights endpoint. Google reporting uses `googleAds:searchStream` with a campaign-level GAQL query and daily date segments. Reporting is read-only; it cannot publish, edit, or increase a campaign budget.

## Provider setup

The existing deployment credentials are reused. Meta needs `META_MARKETING_ACCESS_TOKEN` and optionally `META_MARKETING_API_VERSION`. Google needs `GOOGLE_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, and optionally `GOOGLE_ADS_LOGIN_CUSTOMER_ID` and `GOOGLE_ADS_API_VERSION`.

## Safe testing

`npm run test:analytics` intercepts provider requests and simulates both reporting APIs. It verifies UTM tracking, metric normalization, daily persistence, aggregate totals, and sync timestamps without contacting Meta or Google. `npm run test:ad-deployment` continues to test audience creation and paused campaign deployment in the same safe manner.

## Production hardening next

For production, add encrypted secret storage, provider rate-limit backoff, a durable job queue, an account-level timezone setting, conversion-event mapping per business, and anomaly alerts for spend spikes or tracking outages. The provider APIs can return delayed or attributed conversions, so the dashboard should label attribution windows and distinguish imported metrics from first-party web analytics.
