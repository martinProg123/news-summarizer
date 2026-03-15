(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
import express from "express";
import cors from 'cors';
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
// import { topics as sharedTopics, duration as sharedDuration } from "@shared/constant"
import { z } from "zod";
import { Resend } from 'resend';
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

const mailerSend = new MailerSend({
    apiKey: process.env.MAILER_API as string,
});
// Use an environment variable for security
// const resend = new Resend(process.env.RESEND_API_KEY);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const randomWait = (min = 2000, max = 6000) => {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, ms));
};
const emailSchema = z.string().email("Invalid email format");
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const router = express();
// 1. Configure CORS options
const corsOptions = {
    origin: `http://localhost:5173'}`,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Required if you plan to use Cookies/Sessions later
};

router.use(cors(corsOptions));

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const PORT = '3333';
router.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// const topicSet = new Set(sharedTopics)
const rssParser = new Parser({
    headers: {
        'User-Agent': getRandomUserAgent() as string,
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
});

const article_systemPrompt = `
Role: You are a professional news editor
Task: provide a concise summary a article, given title, content and published date
Formatting Rules:
    provide "SUMMARY:" followed by a paragraph of 2-3 sentence.

    Use a neutral, objective tone.

    Keep key entities (names, prices, dates) intact.

    Only reply with json format:
    {
    "summary": "Your summary paragraph"
    }
`

const overallSummarySystemprompt =
    // `
    // Role: You are an expert Hong Kong News Editor. Your task is to synthesize multiple news summaries into a single, cohesive " Digest" in HTML format.
    // try notice trend and generalize and merge similar news
    // Output Requirements:

    //     Structure: Wrap the output in a <div>. Use <h3> for topic headers and <p> for the narrative summary.

    //     Citations: When you reference a specific fact or article, you must use an anchor link: <a href="URL">Title</a>.

    //     Tone: Professional, objective, and concise.

    //     Constraint: Do not include <html>, <body>, or <head> tags. Provide only the inner content. 
    //     Do not include markdown code blocks (e.g., no html).

    //     Language: use English
    // `
    `
You are a professional news digest editor creating concise, neutral, high-quality daily news summaries for Hong Kong readers.

Rules you must strictly follow:

1. You will receive a list of news items. Each item contains:
   - title
   - url
   - summary (already pre-summarized, usually 3–6 bullets or short paragraph)

2. Create ONE coherent overall digest in **modern, clean HTML** (no <html><head><body> wrapper — just the inner content).

3. Structure of the output:
   - Start with a short overall TL;DR (1–2 sentences)
   - Then group related stories thematically when possible (use <h3> for group titles)
   - For each story: short headline + 2–4 bullet points or short paragraph
   - When you mention or quote from a specific article, ALWAYS create an anchor link using this exact format:
     <a href="URL" target="_blank" rel="noopener noreferrer">Article Title</a>
   - Do NOT use [title](url) markdown — only real HTML <a> tags
   - Do NOT number or bullet the articles themselves — use semantic HTML (<h3>, <p>, <ul>, <li>)
   - End with a small footer note: <p style="font-size:0.9em;color:#666;">Summaries generated by AI • Click titles for original articles</p>

4. Style guidelines:
   - Use very simple inline CSS only (no external stylesheets)
   - Keep it readable on mobile and dark/light mode
   - Links: blue (#0066cc), underline on hover
   - Main text color: #222 (dark mode friendly)

5. Tone & language:
   - Neutral, factual, professional
   - Prefer Traditional Chinese (Hong Kong style) if most articles are in Chinese
   - If articles are mixed, write the digest in Traditional Chinese and include key English terms when necessary
   - Avoid exaggeration, opinion, or sensational language

6. Length:
   - Overall digest should feel like 3–7 minutes reading time
   - Be concise — remove redundancy

Output **only** the HTML content — no explanation, no markdown., no html fences, nothing else.
`



cron.schedule('0 */6 * * *', async () => {
    // cron.schedule('* * * * *', async () => {
    console.log(new Date().toISOString() + ' cron scrap...');

    const source = [
        {
            site: "rthk",
            feeds: [
                { url: "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml", topic: "Hong Kong" },
                { url: "https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml", topic: "World" },
                { url: "https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml", topic: "Business" },
                { url: "https://rthk.hk/rthk/news/rss/c_expressnews_csport.xml", topic: "Sport" }
            ]
        },
        {
            site: "yahoo",
            feeds: [
                { url: "http://localhost:1200/yahoo/news/hk/hong-kong", topic: "Hong Kong" },
                { url: "http://localhost:1200/yahoo/news/hk/business", topic: "Business" },
                { url: "http://localhost:1200/yahoo/news/hk/sports", topic: "Sport" }
            ]
        },
        {
            site: "hk01",
            feeds: [
                { url: "http://localhost:1200/hk01/latest", topic: "Hong Kong" },
                { url: "http://localhost:1200/hk01/channel/4", topic: "Business" },
                { url: "http://localhost:1200/hk01/zone/4", topic: "World" },
                { url: "http://localhost:1200/hk01/zone/3", topic: "Sport" },
                // { url: "http://localhost:1200/hk01/zone/3", topic: "Sport" }
            ]
        }
    ];

    await Promise.all(source.map(async (obj) => {
        for (const feed of obj.feeds) {
            await scrapeNewsFromRSS(feed.url, obj.site, feed.topic);
        }
    }));
});

cron.schedule('0 1 * * *', async () => {
    console.log(`${new Date().toISOString()} Starting database maintenance...`);
    await deleteOldArticles();
});


// // JOB 2: Daily Email Digest (Runs every day at 8:00 AM)
cron.schedule('0 8 * * *', async () => {
    console.log("📧 Generating and sending daily email...");
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let htmlEmail = ''
    try {

        const latestArticles = await prisma.article.findMany({
            where: {
                publishAt: {
                    gte: oneDayAgo,
                },
            },
            select: {
                title: true,
                url: true,
                summary: true,
                topic: true,
            },
            orderBy: {
                topic: 'asc',
            },
        });

        const topicSummaryMap = new Map()
        let curatedContent = ''
        let summaryText = ''
        latestArticles.map(at => {
            curatedContent = `Title: ${at.title}\nURL: ${at.url}\nSummary: ${at.summary}\n---\n`
            if (topicSummaryMap.has(at)) {
                summaryText = topicSummaryMap.get(at.topic)
                topicSummaryMap.set(at.topic, summaryText + curatedContent)
            } else {
                topicSummaryMap.set(at.topic, curatedContent)
            }
        })

        const topicSummaryHtml = new Map();
        for (const topicKey of topicSummaryMap.keys()) {
            try {
                htmlEmail = `<h2>Topic: ${topicKey}</h2>`
                htmlEmail = `<h3>Overall summary: ${topicKey}</h3>`
                const respon = await axios.post("http://localhost:11434/api/chat", {
                    "model": "gemma3:12b",
                    "messages": [
                        { "role": "system", "content": overallSummarySystemprompt },
                        {
                            "role": "user", "content": `### Task: Generate a unified digest.
                        \n\n### Article Data:\n${topicSummaryMap.get(topicKey)}\n\n--- ...`
                        }
                    ],
                    "stream": false
                }, {
                    timeout: 60000 // 60 second timeout for LLM
                })
                htmlEmail += respon.data.message?.content
                htmlEmail += `<hr />`
                htmlEmail += topicSummaryMap.get(topicKey)
                console.log('FULL HTML: ')
                console.log(htmlEmail)
                topicSummaryHtml.set(topicKey, htmlEmail)
            } catch (err) {
                console.log('error during summary from ollama')
            }
        }

        const activeSubscribers = await prisma.subscriber.findMany({
            where: { isUnsub: false },
            select: { email: true, topics: true }
        });

        // const sentFrom = new Sender("Martin@test-3m5jgroex7xgdpyo.mlsender.net", "Martin");
        for (const user of activeSubscribers) {
            // 1. Fetch news for user.topic

            // const recipients = [
            //     new Recipient("user.email", "Dear Subscriber")
            // ];

            htmlEmail = '<h1>Daily AI summary</h1>'
            for (const selectedTopic of user.topics) {
                htmlEmail += topicSummaryHtml.get(selectedTopic)
            }

            // const emailParams = new EmailParams()
            //     .setFrom(sentFrom)
            //     .setTo(recipients)
            //     .setReplyTo(sentFrom)
            //     .setSubject("This is a Subject")
            //     .setHtml(htmlEmail)
            //     .setText("This is the text content");

            // await mailerSend.email.send(emailParams);
        }




        // const { data, error } = await resend.emails.send({
        //     from: 'Acme <onboarding@resend.dev>',
        //     to: ['martin2455voc@proton.me'], // This MUST be this specific email
        //     subject: 'News Update',
        //     html: htmlEmail,
        // });

        // if (error) {
        //     return console.error({ error });
        // }

        // console.log({ data });

    } catch (err) {
        console.error('err: ', err)
    } finally {
        process.exit(0);
    }

});

router.post("/subEmail", async (req, res) => {
    try {
        const { topicArr, userEmail, duration } = req.body;
        if (!userEmail || !duration || topicArr.size === 0)
            res.status(400).json({ error: "Input cannot be empty" });
        // if (!sharedDuration[duration])
        // res.status(400).json({ error: "Invalid input" });
        const emailCheck = emailSchema.safeParse(userEmail);
        if (!emailCheck.success)
            res.status(400).json({ error: emailCheck.error.message });

        const result = await prisma.subscriber.upsert({
            where: { email: userEmail }, // The unique field
            update: {
                isUnsub: false,
                topics: topicArr,
            }, // Do nothing if it exists
            create: {
                email: userEmail,
                topics: topicArr,
                sentFreq: duration,
            }
        });
        res.status(200).json(result.id);
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.post("/unsub", async (req, res) => {
    try {
        const { userEmail } = req.body;

        const deleteUser = await prisma.subscriber.update({
            where: { email: userEmail }
            ,
            data: {
                isUnsub: true
            }
        });

        console.log('deleteUser: ' + deleteUser)
        if (!deleteUser) return res.status(404).json({ error: "User not found" });

        res.json(deleteUser);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
})


const scrapeNewsFromRSS = async (feedsUrl: string, site: string, topic: string) => {
    try {
        // 1. Fetch the XML as a string using Axios
        const response = await axios.get(feedsUrl, {
            headers: {
                'User-Agent': getRandomUserAgent() as string,
                'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
            }
        });

        // 2. Parse the string instead of the URL
        const feed = await rssParser.parseString(response.data);

        // const feed = await rssParser.parseURL(feedsUrl);
        for (const item of feed.items) {
            // await sleep(2000); // Wait 2 seconds between feeds
            if (!item.link) continue;

            const existing = await prisma.article.findUnique({
                where: { url: item.link },
                select: { id: true }
            });

            if (existing) continue

            await randomWait(5000, 20000)
            // 2. Fetch the raw HTML of the article
            const { data: html } = await axios.get(item.link
                , {
                    headers: {
                        'User-Agent': getRandomUserAgent() as string,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Referer': 'https://www.google.com/',

                    },
                    timeout: 10000,

                });

            // 3. Use JSDOM to turn the string into a DOM object
            const dom = new JSDOM(html, { url: item.link });
            try {
                const reader = new Readability(dom.window.document);
                const newsArticle = reader.parse();

                // get summary from ollama, and insert data
                if (newsArticle && newsArticle.textContent) {
                    console.log("Title:", newsArticle.title);
                    const cleanContent = newsArticle.textContent.trim()
                    console.log("Clean Content:", cleanContent);
                    const summary = await getSummary(newsArticle.title!!, cleanContent)
                    if (!summary) continue
                    let dateString = ''
                    if (newsArticle.publishedTime)
                        dateString = newsArticle.publishedTime
                    if (item.pubDate)
                        dateString = item.pubDate


                    await prisma.article.create({
                        data: {
                            url: item.link,
                            source: site,
                            title: newsArticle.title || "Untitled",
                            content: newsArticle.textContent,
                            summary: summary,
                            // embedding: vector, // (When you add the worker)
                            metadata: { site: site },
                            topic: topic,
                            publishAt: dateString ? new Date(dateString) : new Date(),
                        }
                    });

                }
            } finally {
                dom.window.close();
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
            "model": "gemma3:4b",
            "messages": [
                { "role": "system", "content": article_systemPrompt },
                {
                    "role": "user", "content": `
                    ### Title: ${title}
                    
                    ### Article Content:
                    ${cleanContent}
                    
                    ---
                    Instruction: summarize for the HK News Digest.
                    ` }
            ],
            "stream": false
        }, {
            timeout: 60000 // 60 second timeout for LLM
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


const deleteOldArticles = async () => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);

    try {
        const deleted = await prisma.article.deleteMany({
            where: {
                publishAt: {
                    lt: threshold, // "lt" means Less Than
                },
            },
        });
        console.log(`🧹 Cleaned up ${deleted.count} old articles.`);
    } catch (error) {
        console.error("Cleanup failed:", error);
    }
};

export default router;
// test scrap
(async () => {
    // //     console.log("🚀 Starting manual test run...");
    // //     await scrapeNewsFromRSS("https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml", "rthk", "Hong Kong");
    // //     console.log("✅ Test run complete.");
    // //     process.exit(0);

    console.log(new Date().toISOString() + " 📧 Generating and sending daily email...");
    const oneDayAgo = new Date(Date.now() - (24) * 60 * 60 * 1000);
    let htmlEmail = ''
    try {

        const latestArticles = await prisma.article.findMany({
            where: {
                publishAt: {
                    gte: oneDayAgo,
                },
            },
            select: {
                title: true,
                url: true,
                summary: true,
                topic: true,
            },
            orderBy: {
                topic: 'asc',
            },
        });

        const topicSummaryMap = new Map()
        for (const article of latestArticles) {
            const content = `Title: ${article.title}\nURL: ${article.url}\nSummary: ${article.summary}\n---\n`;
            const existing = topicSummaryMap.get(article.topic) || "";
            topicSummaryMap.set(article.topic, existing + content);
        }


        console.log(new Date().toISOString() + " start summary ");
        // const topicSummaryHtml = new Map()
        // const topicKeys = Array.from(topicSummaryMap.keys());
        // for (const topicKey of topicKeys) {

        //     console.log(new Date().toISOString() + " summarize " + topicKey);
        //     try {
        //         const response = await axios.post("http://localhost:11434/api/chat", {
        //             model: "gemma3:4b",
        //             messages: [
        //                 { role: "system", content: overallSummarySystemprompt },
        //                 { role: "user", content: `Task: Digest for ${topicKey}\n${topicSummaryMap.get(topicKey)}` }
        //             ],
        //             stream: false,
        //             temperature: 0.1,
        //         }, { timeout: 1000 * 60 * 7 });

        //         const summary = response.data.message?.content || "Summary unavailable.";
        //         // Corrected HTML concatenation
        //         const html = `<h2>Topic: ${topicKey}</h2>
        //               <h3>Overall summary: </h3>
        //               <p>${summary}</p>
        //               <hr />
        //               ${topicSummaryMap.get(topicKey).replace(/\n/g, '<br>')}`;
        //         topicSummaryHtml.set(topicKey, html);
        //     } catch (err: any) {
        //         console.error(`Error summarizing ${topicKey}:`, err.message);
        //         topicSummaryHtml.set(topicKey, `<h2>${topicKey}</h2><p>Summary Timeout</p>`);
        //     }
        // }

        // console.log(new Date().toISOString() + " end summary ");

        console.log(`${new Date().toISOString()} start parallel summary`);

        // 2. Prepare all LLM requests as an array of Promises
        const topicKeys = Array.from(topicSummaryMap.keys());
        const summaryPromises = topicKeys.map(async (topicKey) => {
            console.log(`${new Date().toISOString()} request queued: ${topicKey}`);

            try {
                const response = await axios.post("http://localhost:11434/api/chat", {
                    model: "gemma3:4b",
                    messages: [
                        { role: "system", content: overallSummarySystemprompt },
                        { role: "user", content: `Task: Digest for ${topicKey}\n${topicSummaryMap.get(topicKey)}` }
                    ],
                    stream: false,
                    temperature: 0.1,
                }, { timeout: 1000 * 60 * 7 });

                const summary = response.data.message?.content || "Summary unavailable.";
                const html = `
                <h2>Topic: ${topicKey}</h2>
                <h3>Overall summary:</h3>
                <p>${summary}</p>
                <hr />
                ${topicSummaryMap.get(topicKey)!.replace(/\n/g, '<br>')}`;

                return { topicKey, html };
            } catch (err: any) {
                console.error(`Error summarizing ${topicKey}:`, err.message);
                return { topicKey, html: `<h2>${topicKey}</h2><p>Summary Timeout or Error</p>` };
            }
        });

        // 3. Execute all requests in parallel and wait for the result
        const summaryResults = await Promise.all(summaryPromises);

        // 4. Convert results back into a Map for easy lookup
        const topicSummaryHtml = new Map(summaryResults.map(res => [res.topicKey, res.html]));

        console.log(`${new Date().toISOString()} end parallel summary`);

        const activeSubscribers = await prisma.subscriber.findMany({
            where: { isUnsub: false },
            select: { email: true, topics: true }
        });

        // const sentFrom = new Sender("Martin@test-3m5jgroex7xgdpyo.mlsender.net", "Martin");
        for (const user of activeSubscribers) {
            // 1. Fetch news for user.topic

            // const recipients = [
            //     new Recipient("user.email", "Dear Subscriber")
            // ];

            htmlEmail = '<h1>Daily AI summary</h1>'
            for (const selectedTopic of user.topics) {
                htmlEmail += topicSummaryHtml.get(selectedTopic)
            }

            // const emailParams = new EmailParams()
            //     .setFrom(sentFrom)
            //     .setTo(recipients)
            //     .setReplyTo(sentFrom)
            //     .setSubject("This is a Subject")
            //     .setHtml(htmlEmail)
            //     .setText("This is the text content");

            // await mailerSend.email.send(emailParams);
            console.log(`${user.email},  ${new Date().toISOString()},` + ' full Email: ')
            console.log(htmlEmail)
            break;
        }




        // const { data, error } = await resend.emails.send({
        //     from: 'Acme <onboarding@resend.dev>',
        //     to: ['martin2455voc@proton.me'], // This MUST be this specific email
        //     subject: 'News Update',
        //     html: htmlEmail,
        // });

        // if (error) {
        //     return console.error({ error });
        // }

        // console.log({ data });

    } catch (err) {
        console.error('err: ', err)
    } finally {
        process.exit(0);
    }

})();

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
