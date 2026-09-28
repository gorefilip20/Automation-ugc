# External references used for the crawl/notification design

- Robots Exclusion Protocol (RFC 9309): https://www.rfc-editor.org/info/rfc9309/
- Slack incoming webhooks: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks

Key implementation constraints carried into the code:
- Crawl public pages only and respect robots.txt.
- SMTP probes can be inconclusive because of greylisting, catch-all domains, privacy protections, and recipient probing defenses.
- Slack incoming webhooks accept JSON payloads at a channel-specific URL; the URL is kept server-side.
