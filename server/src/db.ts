import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/index.js";
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const globalForPrisma = global as unknown as { prisma: PrismaClient; pool: Pool };

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as any);
  return { prisma: new PrismaClient({ adapter }), pool };
}

if (!globalForPrisma.prisma) {
  const { prisma, pool } = createPrismaClient();
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export const prisma = globalForPrisma.prisma;
const pool = globalForPrisma.pool;

export async function prismaDisconnect() {
  await prisma.$disconnect();
  await pool.end();
}