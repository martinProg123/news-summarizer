import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/index.js"; // Point to your custom path
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
// To prevent multiple instances of Prisma Client in development 
// (which can exhaust your database connection pool)
// const globalForPrisma = global as unknown as { prisma: PrismaClient };

// export const prisma =
//   globalForPrisma.prisma ||
//   new PrismaClient({
//     log: ["query", "error", "warn"], // Useful for debugging your vector searches
//   });

// if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);

export const prisma = new PrismaClient({ adapter });