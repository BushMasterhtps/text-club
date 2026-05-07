import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prismaOptions = {
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
} as const;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    process.env.DATABASE_URL
      ? {
          ...prismaOptions,
          datasources: {
            db: {
              url: process.env.DATABASE_URL,
            },
          },
        }
      : prismaOptions,
  );

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown to close connections properly
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}