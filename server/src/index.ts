(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
import { Router } from "express";
import { prisma } from "./db";
// import { getRelatedArticles } from "../generated/prisma/sql"; // If using TypedSQL
import cron from 'node-cron'
import { Worker } from 'node:worker_threads';
import path from 'node:path';

type workerMsg = { status: 'success' | 'error', vector?: number[], error?: string }

const worker = new Worker(path.resolve(__dirname, './embedding-worker.js'));
export function generateEmbedding(text: string) {
    return new Promise((resolve, reject) => {
        // 1. Send the text to the worker
        worker.postMessage(text);

        // 2. Listen for the specific response (one-time listener)
        const onMessage = (response: workerMsg) => {
            if (response.status === 'success') {
                resolve(response.vector);
            } else {
                reject(new Error(response.error));
            }
            cleanup();
        };

        const onError = (err: string) => {
            reject(err);
            cleanup();
        };

        const cleanup = () => {
            worker.off('message', onMessage);
            worker.off('error', onError);
        };

        worker.on('message', onMessage);
        worker.on('error', onError);
    });
}

const router = Router();

cron.schedule('* */6 * * *', () => {
    console.log('running a task every 6 hours');
    const source = {
        "rthk": [
            "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml",
            "https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml",
            // "https://rthk.hk/rthk/news/rss/c_expressnews_csport.xml",
            "https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml",
        ],
        "yahoo": [
            // "https://rsshub.app/yahoo/news/hk/sports",
            "https://rsshub.app/yahoo/news/hk/business",
            "https://rsshub.app/yahoo/news/hk/hong-kong",
        ],
        "hk01": [
            "https://rsshub.app/hk01/latest",
            "https://rsshub.app/hk01/channel/4", //business
            "https://rsshub.app/hk01/zone/4", //national
            // "https://rsshub.app/hk01/zone/3", // sport
            "https://rsshub.app/hk01/zone/11", // tech
        ],
    }

    

});

router.get("/digest/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const subscriber = await prisma.subscriber.findUnique({
            where: { id: BigInt(id) }
        });

        if (!subscriber) return res.status(404).json({ error: "User not found" });

        // Perform your logic...
        res.json(subscriber);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;