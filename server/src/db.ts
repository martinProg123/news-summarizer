import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client"; // Point to your custom path

// To prevent multiple instances of Prisma Client in development 
// (which can exhaust your database connection pool)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "error", "warn"], // Useful for debugging your vector searches
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;