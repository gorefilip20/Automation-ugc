# AI UGC production pipeline

Feature 3 adds a reference-led production workspace for realistic creator videos and image assets.

## Production flow

1. Create a product brief with verified product facts, audience, voice, objective, platform, style, and duration.
2. Select an approved creator avatar reference from Avatar Studio.
3. Optionally provide an approved product image URL. Product references are strongly recommended when packaging, labels, materials, or proportions must remain accurate.
4. Generate a four-beat shot plan: hook, detail, proof, and CTA/close.
5. Queue scene-image reference jobs and one multi-shot master video job.
6. Review the prompt manifest, creator/product fidelity settings, disclosure stamp, and queued jobs.
7. Approve the production before using it in a campaign.

## Native generation contract

The pipeline stores `manus-native` generation jobs with explicit model choices:

- `gpt-image-2.5` for creator and product reference images and scene reference frames.
- `seedance-2-5` for the multi-shot realistic UGC master video.
- Portrait `9:16` output by default.
- Native audio enabled for synchronized dialogue, handling sounds, and room ambience.
- Compatible shots are generated together in one master-video request to preserve continuity.

The server stores the complete prompt and reference manifest so a native media worker can execute the job, persist the returned PNG/MP4 URL, and move the job to `ready`. The current sandbox implementation fully plans and queues these jobs; direct MCP media calls remain an execution-layer responsibility rather than an API-server dependency.

## Realism and safety controls

- Creator identity is tied to an approved avatar reference.
- Product shape, material, packaging, label layout, and colors are explicitly preserved.
- Promotional text is treated as a separate title layer instead of asking the video model to invent exact copy.
- The first two seconds include visible motion, information, and synchronized sound.
- Every production carries `AI-generated virtual creator` disclosure metadata.
- No asset is published automatically.
- The production remains reviewable and approvable before campaign use.

## Validation

Run:

```bash
npm run db:migrate
npm run test:ugc-pipeline
npm run build
```

The end-to-end test verifies brief creation, four-scene planning, `gpt-image-2.5` reference jobs, `seedance-2-5` video jobs, reference assets, queue state, and test cleanup.
