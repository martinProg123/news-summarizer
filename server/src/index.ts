(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import express from "express";
import cors from 'cors';
import { subscriberRouter } from './routes';
import { startCronJobs, stopCronJobs } from './jobs';
import { prismaDisconnect } from './db';

const app = express();

const corsOptions = {
    origin: `http://localhost:5173`,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(subscriberRouter);

const PORT = '3333';
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
})

const SHUTDOWN_TIMEOUT = 1000 * 10

async function shutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    const forceExitTimer = setTimeout(() => {
        console.error("Shutdown timed out! Forcing process exit.");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    forceExitTimer.unref();
    try {
        stopCronJobs();

        await new Promise<void>((resolve) => {
            server.close(() => {
                console.log("HTTP server closed.");
                resolve();
            });
        });

        await prismaDisconnect();
        console.log("Prisma disconnected.");

        clearTimeout(forceExitTimer);
        console.log("Graceful shutdown complete.");
        process.exit(0);
    } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startCronJobs();

export default app;
