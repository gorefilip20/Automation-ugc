import { db } from "../db.js";
import * as schema from "../schema.js";
import { publicProcedure, router } from "../trpc.js";

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;
    const user = db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, ctx.userId!),
    });
    return user ?? null;
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    return { success: true };
  }),
});
