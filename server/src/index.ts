(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import express from "express";
import cors from 'cors';
import { subscriberRouter } from './routes';
import { startCronJobs, stopCronJobs } from './jobs';
import { prismaDisconnect } from './db';
import { terminateWorker } from './services/embedding';
import { toISOStringHK } from './utils/datetime';
import { generateDailyDigest } from './services/email';

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

let isShutDown = false
async function shutdown(signal: string) {
    if (isShutDown) {
        console.log(`\n${signal} received. Already Shutting Down bruh`);
        return;
    }
    isShutDown = true;
    console.log(`\n${signal} received. Shutting down gracefully...`);
    const forceExitTimer = setTimeout(() => {
        console.error("Shutdown timed out! Forcing process exit.");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    forceExitTimer.unref();
    try {
        stopCronJobs();
        await terminateWorker();
        console.log("Embedding worker terminated.");

        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => {
                console.log("HTTP server closed.");
                resolve();
            });
        });
        server.unref();

        await prismaDisconnect();
        console.log("Prisma disconnected.");

        clearTimeout(forceExitTimer);
        process.removeAllListeners();
        console.log("Graceful shutdown complete.");

        process.exit(0);
    } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    shutdown('unhandledRejection');
});

startCronJobs();


export default app;
