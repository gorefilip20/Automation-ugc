# Influencer Discovery and Creator CRM

The first Creator CRM slice gives Growth OS a workspace for discovering, scoring, and shortlisting niche creators. A user enters a niche, selects platforms, optionally adds a location, and runs discovery. Profiles are stored in SQLite and can be searched, filtered by status, shortlisted, marked contacted, partnered, archived, and annotated with team notes.

## Explainable score

Each profile receives a 0–100 fit score composed of niche relevance (35 points), engagement quality (25), audience reach (20), average-view strength (10), and contactability (10). The UI shows the score reasons rather than presenting a black-box ranking.

## Discovery source boundary

The current adapter is deliberately labeled `demo-public-signal`. It seeds realistic workflow fixtures so the CRM, scoring, shortlist, and team-note flows are functional without inventing live platform data or bypassing creator-platform terms. The service boundary is ready for live provider adapters. The next connector should ingest platform-approved data from YouTube Data API, Instagram Graph API, TikTok-approved research/creator endpoints, or a compliant creator marketplace feed. Each provider should return normalized profiles into the same scoring function and preserve source URLs and collection timestamps.

## Responsible outreach

A discoverable profile is not automatically permission to contact. The CRM distinguishes contactability from outreach consent, supports `opted_out`, and keeps activities separate from creator profile data. Outreach sequences should be added only after opt-out handling, rate limits, identity verification, and provider policy checks are in place.

## Validation

Run `npm run test:creator-discovery` to verify niche scoring, discovery persistence, descending ranking, shortlist status changes, notes, and test-fixture cleanup.
