import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import {
  generateAvatarImageUrl,
  generateVariationGroup,
} from "../services/ugc-generator.js";
import { protectedProcedure, router } from "../trpc.js";

export const avatarRouter = router({
  generate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        prompt: z.string().min(1),
        seed: z.number(),
        pose: z.string(),
        wardrobe: z.string(),
        setting: z.string().optional(),
        composition: z.string().optional(),
        identityLock: z.boolean(),
        ageConfirmed: z.boolean(),
        referenceImage: z
          .object({
            b64Json: z.string(),
            mimeType: z.string(),
            fileName: z.string(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const imageUrl = generateAvatarImageUrl(input.seed);

      const result = db
        .insert(schema.avatarProfiles)
        .values({
          workspaceId: input.workspaceId,
          prompt: input.prompt,
          seed: input.seed,
          pose: input.pose,
          wardrobe: input.wardrobe,
          setting: input.setting,
          composition: input.composition,
          identityLock: input.identityLock ? 1 : 0,
          ageConfirmed: input.ageConfirmed ? 1 : 0,
          imageUrl,
          status: "ready",
        })
        .run();

      const profileId = Number(result.lastInsertRowid);

      db.insert(schema.contentItems)
        .values({
          workspaceId: input.workspaceId,
          avatarProfileId: profileId,
          title: `Avatar ${input.pose}`,
          kind: "image",
          assetUrl: imageUrl,
          status: "ready",
        })
        .run();

      return { profileId, imageUrl, seed: input.seed };
    }),

  batchGenerate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        prompt: z.string().min(1),
        seed: z.number(),
        pose: z.string(),
        wardrobe: z.string(),
        setting: z.string().optional(),
        composition: z.string().optional(),
        identityLock: z.boolean(),
        ageConfirmed: z.boolean(),
        count: z.number().min(2).max(4),
        wardrobes: z.array(z.string()),
        referenceImage: z
          .object({
            b64Json: z.string(),
            mimeType: z.string(),
            fileName: z.string(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const variationGroup = generateVariationGroup();
      const results: Array<{
        profileId: number;
        contentId: number;
        imageUrl: string;
        seed: number;
        variationIndex: number;
        isSelected: boolean;
        wardrobe: string;
      }> = [];

      for (let i = 0; i < input.count; i++) {
        const varSeed = input.seed + i * 42;
        const imageUrl = generateAvatarImageUrl(varSeed);
        const wardrobeText = input.wardrobes[i] || input.wardrobe;

        const profileResult = db
          .insert(schema.avatarProfiles)
          .values({
            workspaceId: input.workspaceId,
            prompt: input.prompt,
            seed: varSeed,
            pose: input.pose,
            wardrobe: wardrobeText,
            setting: input.setting,
            composition: input.composition,
            identityLock: input.identityLock ? 1 : 0,
            ageConfirmed: input.ageConfirmed ? 1 : 0,
            imageUrl,
            variationGroup,
            variationIndex: i,
            isSelected: i === 0 ? 1 : 0,
            status: "ready",
          })
          .run();

        const profileId = Number(profileResult.lastInsertRowid);

        const contentResult = db
          .insert(schema.contentItems)
          .values({
            workspaceId: input.workspaceId,
            avatarProfileId: profileId,
            title: `Variation ${i + 1} (${wardrobeText})`,
            kind: "image",
            assetUrl: imageUrl,
            status: "ready",
          })
          .run();

        results.push({
          profileId,
          contentId: Number(contentResult.lastInsertRowid),
          imageUrl,
          seed: varSeed,
          variationIndex: i,
          isSelected: i === 0,
          wardrobe: wardrobeText,
        });
      }

      return { variationGroup, results };
    }),

  selectVariation: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        variationGroup: z.string(),
        profileId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const profiles = db.query.avatarProfiles.findMany({
        where: (p, { and, eq }) =>
          and(
            eq(p.workspaceId, input.workspaceId),
            eq(p.variationGroup, input.variationGroup)
          ),
      }) as unknown as any[];

      for (const profile of profiles) {
        db.update(schema.avatarProfiles)
          .set({ isSelected: profile.id === input.profileId ? 1 : 0 })
          .where(eq(schema.avatarProfiles.id, profile.id))
          .run();
      }

      return { success: true };
    }),

  reorderVariations: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        variationGroup: z.string(),
        profileIds: z.array(z.number()),
      })
    )
    .mutation(async ({ input }) => {
      input.profileIds.forEach((id, index) => {
        db.update(schema.avatarProfiles)
          .set({ variationIndex: index })
          .where(eq(schema.avatarProfiles.id, id))
          .run();
      });
      return { success: true };
    }),

  regenerate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        profileId: z.number(),
        prompt: z.string(),
        seed: z.number(),
        pose: z.string(),
        wardrobe: z.string(),
        setting: z.string().optional(),
        composition: z.string().optional(),
        identityLock: z.boolean(),
        ageConfirmed: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const imageUrl = generateAvatarImageUrl(input.seed);

      db.update(schema.avatarProfiles)
        .set({
          prompt: input.prompt,
          seed: input.seed,
          pose: input.pose,
          wardrobe: input.wardrobe,
          imageUrl,
          status: "ready",
        })
        .where(eq(schema.avatarProfiles.id, input.profileId))
        .run();

      return { imageUrl, seed: input.seed };
    }),

  batchExport: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        variationGroup: z.string(),
        profileIds: z.array(z.number()),
        platform: z.enum(["Instagram", "TikTok"]),
      })
    )
    .mutation(async ({ input }) => {
      for (const profileId of input.profileIds) {
        const profile = db.query.avatarProfiles.findFirst({
          where: eq(schema.avatarProfiles.id, profileId),
        }) as any;
        if (!profile) continue;

        db.insert(schema.contentItems)
          .values({
            workspaceId: input.workspaceId,
            avatarProfileId: profileId,
            title: `${input.platform} export (${profile.wardrobe})`,
            kind: "export",
            channel: input.platform,
            format:
              input.platform === "Instagram"
                ? "Carousel"
                : "Vertical",
            assetUrl: profile.imageUrl,
            status: "exported",
          })
          .run();
      }

      return { success: true, count: input.profileIds.length };
    }),
});
