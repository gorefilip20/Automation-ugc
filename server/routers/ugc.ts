import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import {
  generateCampaignContent,
  generateUGCScript,
} from "../services/ugc-generator.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const ugcRouter = router({
  generateVideo: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        avatarProfileId: z.number().optional(),
        title: z.string().min(1),
        productName: z.string().min(1),
        productDescription: z.string().min(1),
        style: z.enum([
          "testimonial",
          "unboxing",
          "tutorial",
          "review",
          "lifestyle",
          "before_after",
          "day_in_life",
          "get_ready",
          "haul",
          "storytelling",
        ]),
        platform: z.enum([
          "instagram",
          "tiktok",
          "youtube_shorts",
          "facebook",
        ]),
        duration: z.number().min(15).max(180).default(30),
        customHook: z.string().optional(),
        callToAction: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const script = generateUGCScript({
        productName: input.productName,
        productDescription: input.productDescription,
        style: input.style,
        platform: input.platform,
        duration: input.duration,
        customHook: input.customHook,
        callToAction: input.callToAction,
      });

      const result = db
        .insert(schema.ugcVideos)
        .values({
          workspaceId: input.workspaceId,
          avatarProfileId: input.avatarProfileId,
          title: input.title,
          script: JSON.stringify(script),
          style: input.style,
          platform: input.platform,
          duration: input.duration,
          productName: input.productName,
          productDescription: input.productDescription,
          callToAction: script.callToAction,
          hook: script.hook,
          scenes: JSON.stringify(script.scenes),
          voiceoverText: script.voiceover,
          musicStyle: script.musicSuggestion,
          captionStyle: script.captionStyle,
          status: "ready",
        })
        .run();

      const videoId = Number(result.lastInsertRowid);

      db.insert(schema.contentItems)
        .values({
          workspaceId: input.workspaceId,
          avatarProfileId: input.avatarProfileId,
          title: input.title,
          kind: "video",
          channel: input.platform,
          format: `${input.style} (${input.duration}s)`,
          body: script.voiceover,
          status: "ready",
        })
        .run();

      return { videoId, script };
    }),

  getVideo: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const video = db.query.ugcVideos.findFirst({
        where: eq(schema.ugcVideos.id, input.id),
      }) as any;
      if (!video) return null;
      return {
        ...video,
        script: JSON.parse(video.script),
        scenes: video.scenes ? JSON.parse(video.scenes) : [],
      };
    }),

  listVideos: publicProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      return db.query.ugcVideos.findMany({
        where: eq(schema.ugcVideos.workspaceId, input.workspaceId),
        orderBy: (v, { desc }) => [desc(v.createdAt)],
      });
    }),

  createCampaign: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        name: z.string().min(1),
        productName: z.string().min(1),
        productCategory: z.string().min(1),
        targetAudience: z.string().min(1),
        brandVoice: z.string().optional(),
        objectives: z.string().optional(),
        platforms: z.array(z.string()).min(1),
        contentTypes: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ input }) => {
      const campaignResult = db
        .insert(schema.ugcCampaigns)
        .values({
          workspaceId: input.workspaceId,
          name: input.name,
          productName: input.productName,
          productCategory: input.productCategory,
          targetAudience: input.targetAudience,
          brandVoice: input.brandVoice,
          objectives: input.objectives,
          platforms: JSON.stringify(input.platforms),
          contentTypes: JSON.stringify(input.contentTypes),
          status: "active",
        })
        .run();

      const campaignId = Number(campaignResult.lastInsertRowid);

      const content = generateCampaignContent({
        productName: input.productName,
        productCategory: input.productCategory,
        targetAudience: input.targetAudience,
        brandVoice: input.brandVoice,
        objectives: input.objectives,
        platforms: input.platforms,
        contentTypes: input.contentTypes,
      });

      for (const script of content.scripts) {
        db.insert(schema.contentItems)
          .values({
            workspaceId: input.workspaceId,
            title: `${input.name} script`,
            kind: "ugc_script",
            body: JSON.stringify(script),
            status: "ready",
          })
          .run();
      }

      for (const caption of content.captions) {
        db.insert(schema.contentItems)
          .values({
            workspaceId: input.workspaceId,
            title: `${input.name} caption`,
            kind: "caption",
            body: caption,
            status: "ready",
          })
          .run();
      }

      db.insert(schema.contentItems)
        .values({
          workspaceId: input.workspaceId,
          title: `${input.name} campaign plan`,
          kind: "campaign",
          body: JSON.stringify({
            hashtags: content.hashtags,
            postingSchedule: content.postingSchedule,
          }),
          status: "ready",
        })
        .run();

      return { campaignId, content };
    }),

  getCampaign: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const campaign = db.query.ugcCampaigns.findFirst({
        where: eq(schema.ugcCampaigns.id, input.id),
      }) as any;
      if (!campaign) return null;
      return {
        ...campaign,
        platforms: JSON.parse(campaign.platforms),
        contentTypes: JSON.parse(campaign.contentTypes),
      };
    }),

  listCampaigns: publicProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      return db.query.ugcCampaigns.findMany({
        where: eq(schema.ugcCampaigns.workspaceId, input.workspaceId),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });
    }),

  generateQuickContent: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        prompt: z.string().min(1),
        productName: z.string().min(1),
        platform: z
          .enum(["instagram", "tiktok", "youtube_shorts", "facebook"])
          .default("instagram"),
      })
    )
    .mutation(async ({ input }) => {
      const styles = [
        "testimonial",
        "lifestyle",
        "review",
        "tutorial",
      ] as const;
      const style = styles[Math.floor(Math.random() * styles.length)];

      const script = generateUGCScript({
        productName: input.productName,
        productDescription: input.prompt,
        style,
        platform: input.platform,
        duration: 30,
      });

      const videoResult = db
        .insert(schema.ugcVideos)
        .values({
          workspaceId: input.workspaceId,
          title: `Quick UGC: ${input.productName}`,
          script: JSON.stringify(script),
          style,
          platform: input.platform,
          duration: 30,
          productName: input.productName,
          productDescription: input.prompt,
          hook: script.hook,
          scenes: JSON.stringify(script.scenes),
          voiceoverText: script.voiceover,
          callToAction: script.callToAction,
          musicStyle: script.musicSuggestion,
          captionStyle: script.captionStyle,
          status: "ready",
        })
        .run();

      return {
        videoId: Number(videoResult.lastInsertRowid),
        script,
        style,
      };
    }),
});
