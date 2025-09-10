import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { parse } from "csv-parse/sync";
import { prisma } from "~/server/db";

// Simulate a background job queue (in real app, use BullMQ)
const importJobs = new Map<string, {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
}>();

export const csvRouter = createTRPCRouter({
  // Start CSV import (returns job ID immediately)
  import: publicProcedure
    .input(z.object({
      csvData: z.string(), // Base64 encoded CSV
      source: z.enum(['WOD_IVCS', 'EMAIL_REQUESTS']),
    }))
    .mutation(async ({ input }) => {
      const jobId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Initialize job
      importJobs.set(jobId, {
        status: 'queued',
        progress: 0,
      });

      // Start background processing (simulate async)
      processImportJob(jobId, input.csvData, input.source);

      return { jobId, status: 'queued' as const };
    }),

  // Check import progress
  getStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = importJobs.get(input.jobId);
      if (!job) {
        throw new Error('Job not found');
      }
      return job;
    }),

  // Get all tasks (type-safe!)
  getTasks: publicProcedure
    .input(z.object({
      taskType: z.enum(['WOD_IVCS', 'EMAIL_REQUESTS', 'TEXT_CLUB']).optional(),
      limit: z.number().min(1).max(100).default(10),
    }))
    .query(async ({ input }) => {
      const tasks = await prisma.task.findMany({
        where: input.taskType ? { taskType: input.taskType } : undefined,
        take: input.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          taskType: true,
          customerName: true,
          documentNumber: true,
          status: true,
          createdAt: true,
        },
      });

      return { tasks, count: tasks.length };
    }),
});

// Background job processor (simulates what BullMQ would do)
async function processImportJob(jobId: string, csvData: string, source: string) {
  try {
    const job = importJobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    job.progress = 10;

    // Decode and parse CSV
    const csvText = Buffer.from(csvData, 'base64').toString('utf-8');
    const records = parse(csvText, { columns: true });
    
    job.progress = 30;

    // Process in batches (no timeout issues!)
    const batchSize = 50;
    let imported = 0;
    let duplicates = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Process batch (in real app, this would be actual database operations)
      for (const record of batch) {
        // Simulate duplicate detection
        if (Math.random() > 0.8) {
          duplicates++;
        } else {
          imported++;
        }
      }

      // Update progress
      job.progress = 30 + ((i + batchSize) / records.length) * 60;
    }

    // Complete job
    job.status = 'completed';
    job.progress = 100;
    job.result = {
      imported,
      duplicates,
      total: records.length,
      source,
    };

  } catch (error) {
    const job = importJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }
}
