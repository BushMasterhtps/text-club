import { createTRPCRouter } from "~/server/api/trpc";
import { csvRouter } from "~/server/api/routers/csv";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  csv: csvRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
