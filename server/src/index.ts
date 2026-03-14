(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
import { Router } from "express";
import { prisma } from "./db";
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const router = Router();
const rssParser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
});

const systemPrompt = `
Role: You are a professional news editor
Task: provide a concise summary a article, given title, content and published date
Formatting Rules:
    provide "SUMMARY:" followed by a paragraph of 3-5 bullet points.

    Use a neutral, objective tone.

    Keep key entities (names, prices, dates) intact.

    Only reply with json format:
    {
    "summary": "Your summary paragraph in bullet point form"
    }
`

cron.schedule('0 */6 * * *', async () => {
    // cron.schedule('* * * * *', async () => {
    console.log(new Date().toISOString() + ' cron scrap...');

    const source = [
        {
            site: "rthk",
            topics: ['Hong Kong', 'World', 'Business', 'Sport'],
            link: [
                "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml",
                "https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml",
                "https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml",
                "https://rthk.hk/rthk/news/rss/c_expressnews_csport.xml",
            ]
        },
        {
            site: "yahoo",
            topics: ['Hong Kong', 'Business', 'Sport'],
            link: [
                "http://localhost:1200/yahoo/news/hk/hong-kong",
                "http://localhost:1200/yahoo/news/hk/business",
                "http://localhost:1200/yahoo/news/hk/sports",
            ]
        },
        {
            site: "hk01",
            topics: ['Hong Kong', 'Business', 'World', 'Sport'],
            link: [
                "http://localhost:1200/hk01/latest",
                "http://localhost:1200/hk01/channel/4", //business
                "http://localhost:1200/hk01/zone/4", //national
                "http://localhost:1200/hk01/zone/3", // sport
                // "http://localhost:1200/hk01/zone/11", // tech
            ]
        },
    ]



    for (const obj of source) {
        for (const feedsUrl of obj.link) {
            await scrapeNewsFromRSS(feedsUrl, obj.site, obj.topics)
        }
    }

    // await prisma.article.upsert({
    //     where: { url: item.link }, // The unique field
    //     update: {}, // Do nothing if it exists
    //     create: {
    //         url: item.link,
    //         title: newsArticle.title,
    //         content: newsArticle.textContent,
    //         // embedding: vector, // (When you add the worker)
    //         metadata: { site: site }
    //     }
    // });

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

router.post("unsub", async (req, res) => {
    try {
        const { userEmail } = req.body;

        const deleteUser = await prisma.subscriber.delete({
            where: { email: userEmail }
        });

        if (!deleteUser) return res.status(404).json({ error: "User not found" });

        // Perform your logic...
        res.json(deleteUser);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
})

export default router;

const scrapeNewsFromRSS = async (feedsUrl: string, site: string, topics: string) => {
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

        // const feed = await rssParser.parseURL(feedsUrl);
        for (const item of feed.items) {
            await sleep(2000); // Wait 2 seconds between feeds
            if (!item.link) continue;

            const existing = await prisma.article.findUnique({
                where: { url: item.link }
            });

            if (existing) continue

            // 2. Fetch the raw HTML of the article
            const { data: html } = await axios.get(item.link, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0' } });

            // 3. Use JSDOM to turn the string into a DOM object
            const dom = new JSDOM(html, { url: item.link });

            // 4. Use Readability to extract only the core content
            const reader = new Readability(dom.window.document);
            const newsArticle = reader.parse();

            if (newsArticle && newsArticle.textContent) {
                console.log("Title:", newsArticle.title);
                const cleanContent = newsArticle.textContent.trim()
                console.log("Clean Content:", cleanContent);
                const summary = await getSummary(newsArticle.title!!, cleanContent)
                if (!summary) continue
                await prisma.article.upsert({
                    where: { url: item.link }, // The unique field
                    update: {}, // Do nothing if it exists
                    create: {
                        url: item.link,
                        source: site,
                        title: newsArticle.title!!,
                        content: newsArticle.textContent,
                        summary: summary,
                        // embedding: vector, // (When you add the worker)
                        metadata: { site: site },
                        topic: topics,
                    }
                });
            }


        }
    } catch (error) {
        console.error(`Failed:`, error);
    }
}

const getSummary = async (title: string, cleanContent: string) => {
    let data = null
    try {

        const respon = await axios.post("http://localhost:11434/api/chat", {
            "model": "gemma3",
            "messages": [
                { "role": "system", "content": systemPrompt },
                {
                    "role": "user", "content": `
                    ### Title: ${title}
                    
                    ### Article Content:
                    ${cleanContent}
                    
                    ---
                    Instruction: summarize for the HK News Digest.
                    ` }
            ]
        })
        data = respon.data.message?.content
        // console.log(data)
        return data
    } catch (err) {
        console.log("cant get it")
        console.log(err)
        return data
    }
}


// type workerMsg = { status: 'success' | 'error', vector?: number[], error?: string }
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const worker = new Worker(path.resolve(__dirname, './embed-worker.js'));
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