# External references used for the crawl/notification design

- Robots Exclusion Protocol (RFC 9309): https://www.rfc-editor.org/info/rfc9309/
- Slack incoming webhooks: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks

Key implementation constraints carried into the code:
- Crawl public pages only and respect robots.txt.
- SMTP probes can be inconclusive because of greylisting, catch-all domains, privacy protections, and recipient probing defenses.
- Slack incoming webhooks accept JSON payloads at a channel-specific URL; the URL is kept server-side.

## Analytics reporting references

- Meta Ads Insights API: https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights
- Meta Insights best practices: https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/best-practices
- Google Ads Query Language overview: https://developers.google.com/google-ads/api/docs/query/overview
- Google Ads reporting: https://developers.google.com/google-ads/api/docs/shopping-ads/reporting

The implementation uses Meta campaign Insights fields for daily impressions, reach, clicks, spend, CTR, CPC, and action-derived conversions. Google uses campaign-level GAQL metrics via `googleAds:searchStream`, including daily date segments, impressions, clicks, cost micros, conversions, CTR, and average CPC.
