(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
import { Router } from "express";
// import { prisma } from "./db";
// import { getRelatedArticles } from "../generated/prisma/sql"; // If using TypedSQL
import cron from 'node-cron'
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
// import {topics} from "@shared/constant"

// type workerMsg = { status: 'success' | 'error', vector?: number[], error?: string }
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const worker = new Worker(path.resolve(__dirname, './embedding-worker.js'));
// export function generateEmbedding(text: string) {
//     return new Promise((resolve, reject) => {
//         // 1. Send the text to the worker
//         worker.postMessage(text);

//         // 2. Listen for the specific response (one-time listener)
//         const onMessage = (response: workerMsg) => {
//             if (response.status === 'success') {
//                 resolve(response.vector);
//             } else {
//                 reject(new Error(response.error));
//             }
//             cleanup();
//         };

//         const onError = (err: string) => {
//             reject(err);
//             cleanup();
//         };

//         const cleanup = () => {
//             worker.off('message', onMessage);
//             worker.off('error', onError);
//         };

//         worker.on('message', onMessage);
//         worker.on('error', onError);
//     });
// }

const router = Router();
const rssParser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
});

// cron.schedule('* */6 * * *', async () => {
cron.schedule('* * * * *', async () => {
    console.log(new Date().toISOString() + ' cron scrap...');
    const source = {
        // "rthk": [
        //     "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml",
        //     "https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml",
        //     "https://rthk.hk/rthk/news/rss/c_expressnews_csport.xml",
        //     "https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml",
        // ],
        "yahoo": [
            // "https://rsshub.app/yahoo/news/hk/sports",
            "https://rsshub.app/yahoo/news/hk/business",
            // "https://rsshub.app/yahoo/news/hk/hong-kong",
        ],
        "hk01": [
            "https://rsshub.app/hk01/latest",
            // "https://rsshub.app/hk01/channel/4", //business
            //     "https://rsshub.app/hk01/zone/4", //national
            //     // "https://rsshub.app/hk01/zone/3", // sport
            //     "https://rsshub.app/hk01/zone/11", // tech
        ],
    }

    for (const [site, links] of Object.entries(source)) {
        console.log(site + ': ')
        for (const feedsUrl of links) {
            await scrapeNewsFromRSS(feedsUrl)
        }
    }

});

// router.get("/digest/:id", async (req, res) => {
//     try {
//         const { id } = req.params;

//         const subscriber = await prisma.subscriber.findUnique({
//             where: { id: BigInt(id) }
//         });

//         if (!subscriber) return res.status(404).json({ error: "User not found" });

//         // Perform your logic...
//         res.json(subscriber);
//     } catch (error) {
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });

export default router;

const scrapeNewsFromRSS = async (feedsUrl: string) => {
    try {
        // 1. Fetch the XML as a string using Axios
        const response = await axios.get(feedsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
            }
        });

        // 2. Parse the string instead of the URL
        const feed = await rssParser.parseString(response.data);

        console.log(`Successfully fetched: ${feed.title}`);
        // const feed = await rssParser.parseURL(feedsUrl);
        console.log(feed)
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        // inside your loop:
        await sleep(2000); // Wait 2 seconds between feeds
        for (const item of feed.items) {
            if (!item.link) continue;
            // console.log(feed)

            // 2. Fetch the raw HTML of the article
            const { data: html } = await axios.get(item.link, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0' } });

            // 3. Use JSDOM to turn the string into a DOM object
            const dom = new JSDOM(html, { url: item.link });

            // 4. Use Readability to extract only the core content
            const reader = new Readability(dom.window.document);
            const newsArticle = reader.parse();

            if (newsArticle && newsArticle.textContent) {
                console.log("Title:", newsArticle.title);
                console.log("Clean Content:", newsArticle.textContent.trim());
                break;
                // NEXT STEP: Send article.textContent to your 
                // Embedding Worker and then to Ollama for Summary

            }
        }
    } catch (error) {
        console.error(`Failed:`, error);
    }
}