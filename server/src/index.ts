(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
import express from "express";
import cors from 'cors';
import { prisma } from "./db";
import cron from 'node-cron'
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { z } from "zod";
import { Resend } from 'resend';
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

const mailerSend = new MailerSend({
    apiKey: process.env.MAILER_API as string,
});
// Use an environment variable for security
// const resend = new Resend(process.env.RESEND_API_KEY);


const topicQueries: Record<string, string> = {
    "Hong Kong": "Hong Kong news: local affairs, government, society, Hong Kong politics, city events",
    "World": "World news: international affairs, global events, geopolitics, international relations",
    "Business": "Business news: finance, markets, economy, companies, stocks, commerce, investment",
    "Sport": "Sports news: athletics, competitions, matches, sports events, players, tournaments"
};

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

const toISOStringHK = (date: Date = new Date()): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const d = new Date(date);
    const getPart = (method: 'getFullYear' | 'getMonth' | 'getDate' | 'getHours' | 'getMinutes' | 'getSeconds', offset = 0) => {
        const val = d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', [method === 'getMonth' ? 'month' : method === 'getDate' ? 'day' : method === 'getHours' ? 'hour' : method === 'getMinutes' ? 'minute' : method === 'getSeconds' ? 'second' : 'year']: 'numeric' });
        return pad(method === 'getMonth' ? parseInt(getPartStr('getMonth')) + 1 : parseInt(getPartStr(method)));
    };
    const getPartStr = (method: string) => {
        const str = d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', 
            [method === 'getMonth' ? 'month' : method === 'getDate' ? 'day' : method === 'getHours' ? 'hour' : method === 'getMinutes' ? 'minute' : method === 'getSeconds' ? 'second' : 'year']: 'numeric' });
        return str;
    };
    const year = d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', year: 'numeric' });
    const month = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', month: 'numeric' })));
    const day = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', day: 'numeric' })));
    const hour = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false })));
    const minute = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', minute: 'numeric' })));
    const second = pad(parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong', second: 'numeric' })));
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000+08:00`;
};

// worker

type workerMsg = { status: 'success' | 'error', vector?: number[], error?: string }
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const worker = new Worker(path.resolve(__dirname, './embed-worker.js'));

function generateEmbedding(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
        worker.postMessage(text);

        const onMessage = (response: workerMsg) => {
            if (response.status === 'success' && response.vector) {
                resolve(response.vector);
            } else {
                reject(new Error(response.error || 'No vector returned'));
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
Role: 你係一個專業既香港新聞編輯
Task: 根據標題、內容，提供一篇新聞既簡潔摘要

重要規則（必須嚴格遵守）：
    - 必須用香港風格既繁體中文回覆，唔好用英文
    - 絕對唔可以包含任何英文詞彙（除非係專有名詞或組織名稱）
    - 只可以輸出JSON格式，絕對唔可以輸出HTML、markdown或其他格式
    - 2-3句段落總結，開頭唔洗加 "SUMMARY:"
    - 保持客觀、中立既語氣

JSON格式：
{
"summary": "你既摘要段落"
}
`

const overallSummarySystemprompt = `
你係一個專業既香港新聞編輯，任務係將多篇新聞摘要整合成一份連貫、流暢既「每日新聞總覽」。

重要規則（必須嚴格遵守）：

1. 輸入數據：
   - 每篇新聞包含：標題(title)、連結(url)、已經濃縮既摘要(summary)

2. 輸出要求：
   - 創建一份完整既HTML內容（無需<html><head><body>標籤）
   - 以 TL;DR 開始（1-2句概括整體）
   - 主體係連貫既敘事式段落，唔好只係列出獨立既新聞標題

3. 引用文章（非常重要）：
   - 當提到或引用某篇具體文章既內容/事實時，必須使用以下格式既錨點連結：
     <a href="URL" target="_blank" rel="noopener noreferrer">文章標題</a>
   - 將連結直接嵌入係敘事文字中，例如：「根據<a href="...">某篇文章</a>既報導...」
   - 絕對唔可以使用 [標題](URL) 這種markdown格式
   - 每一段敘事都应该引用相關既文章連結

4. 格式同埋樣式：
   - 使用簡單既inline CSS
   - 主要文字顏色：#222
   - 連結顏色：#0066cc，hover時加底線
   - 使用<h3>用作分段標題，<p>用作正文
   - 保持行動裝置同埋深色/淺色模式既可讀性
   - 結尾加footer：<p style="font-size:0.9em;color:#666;">AI生成摘要•標題可連結至原文</p>

5. 語言同埋語氣：
   - 使用香港風格既繁體中文
   - 保持客觀、專業、中立
   - 避免誇張、主觀意見或煽情既語言

6. 長度：
   - 整體總覽應該適中，約3-7分鐘閱讀時間
   - 移除重複既資訊

Output **only** the HTML content — no explanation, no markdown, no code fences, nothing else.
`



cron.schedule('0 */6 * * *', async () => {
    // cron.schedule('* * * * *', async () => {
    console.log(toISOStringHK() + ' cron scrap...');

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
    console.log(`${toISOStringHK()} Starting database maintenance...`);
    await deleteOldArticles();
});


// // JOB 2: Daily Email Digest (Runs every day at 8:00 AM)
cron.schedule('0 8 * * *', async () => {
    console.log(toISOStringHK()+" Generating and sending daily email...");
    await generateDailyDigest();
});

async function generateDailyDigest() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const topicSummaryHtml = new Map<string, string>();

    for (const [topic, topicQuery] of Object.entries(topicQueries)) {
        console.log(`${toISOStringHK()} Processing topic: ${topic}`);
        
        let articles: { id: BigInt; title: string; url: string; content: string; embedding: any; publishAt: Date }[];

        try {
            const topicEmbedding = await generateEmbedding(topicQuery);
            const embeddingStr = `[${topicEmbedding.join(',')}]`;

            const rawArticles = await prisma.$queryRaw<any[]>`
                SELECT id, title, url, content, embedding, "publish_at"
                FROM article
                WHERE "publish_at" >= ${oneDayAgo}
                  AND topic = ${topic}
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> ${embeddingStr}::vector
                LIMIT 15
            `;
            articles = rawArticles;

            if (articles.length < 10) {
                const fallbackArticles = await prisma.$queryRaw<any[]>`
                    SELECT id, title, url, content, embedding, "publish_at"
                    FROM article
                    WHERE "publish_at" >= ${oneDayAgo}
                      AND topic = ${topic}
                    ORDER BY "publish_at" DESC
                    LIMIT 15
                `;
                const existingIds = new Set(articles.map(a => a.id.toString()));
                const newArticles = fallbackArticles.filter(a => !existingIds.has(a.id.toString()));
                articles = [...articles, ...newArticles].slice(0, 15);
            }
        } catch (err) {
            console.error(`Vector search failed for ${topic}, using fallback:`, err);
            articles = await prisma.$queryRaw<any[]>`
                SELECT id, title, url, content, embedding, "publish_at"
                FROM article
                WHERE "publish_at" >= ${oneDayAgo}
                  AND topic = ${topic}
                ORDER BY "publish_at" DESC
                LIMIT 15
            `;
        }

        console.log(`Found ${articles.length} articles for topic: ${topic}`);

        if (articles.length === 0) {
            topicSummaryHtml.set(topic, `<h2>Topic: ${topic}</h2><p>No articles found.</p>`);
            continue;
        }

        interface ArticleWithSummary {
            title: string;
            url: string;
            summary: string;
            publishAt: Date;
        }

        const articleSummaries: ArticleWithSummary[] = [];
        for (const article of articles) {
            const summary = await getSummary(article.title, article.content.slice(0, 3000));
            if (summary) {
                articleSummaries.push({
                    title: article.title,
                    url: article.url,
                    summary: summary,
                    publishAt: article.publishAt
                });
            }
        }

        const combinedContent = articleSummaries
            .map(a => `Title: ${a.title}\nURL: ${a.url}\nSummary: ${a.summary}\nDate: ${a.publishAt}\n---\n`)
            .join('');

        try {
            const response = await axios.post("http://localhost:11434/api/chat", {
                "model": "gemma3:12b",
                "messages": [
                    { "role": "system", "content": overallSummarySystemprompt },
                    {
                        "role": "user", "content": `### Task: Generate a unified digest.\n\n### Article Data:\n${combinedContent}\n\n--- ...`
                    }
                ],
                "stream": false
            }, { timeout: 120000 });

            const overallSummary = response.data.message?.content || "Summary unavailable.";

            const formatDate = (d: Date | string) => {
                const date = new Date(d);
                if (isNaN(date.getTime())) return 'Invalid Date';
                const day = date.getDate();
                const month = date.toLocaleString('en-GB', { month: 'short', timeZone: 'Asia/Hong_Kong' });
                const year = date.getFullYear();
                const hours = date.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' });
                const minutes = date.toLocaleString('en-GB', { minute: '2-digit', timeZone: 'Asia/Hong_Kong' });
                return `${day} ${month} ${year} ${hours}:${minutes}`;
            };

            const articlesHtml = articleSummaries.map(a => `
                <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:12px 0;border-left:4px solid #0066cc;">
                    <a href="${a.url}" target="_blank" rel="noopener noreferrer" style="font-size:1.1em;font-weight:600;color:#0066cc;text-decoration:none;">
                        ${a.title}
                    </a>
                    <p style="margin:8px 0;color:#444;line-height:1.5;">${a.summary}</p>
                    <span style="font-size:0.85em;color:#666;">${formatDate(a.publishAt)}</span>
                </div>
            `).join('');

            const html = `
                <h2 style="color:#222;margin-top:24px;">${topic}</h2>
                <h3 style="color:#444;margin-top:16px;">總覽：</h3>
                <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:20px;margin:12px 0;">
                    ${overallSummary}
                </div>
                <h3 style="color:#444;margin-top:24px;">相關文章：</h3>
                ${articlesHtml}
                <p style="font-size:0.9em;color:#666;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">AI生成摘要•標題可連結至原文</p>
            `;
            topicSummaryHtml.set(topic, html);
        } catch (err) {
            console.error(`Failed to generate summary for ${topic}:`, err);
            topicSummaryHtml.set(topic, `<h2>${topic}</h2><p>Summary generation failed.</p>`);
        }
    }

    const activeSubscribers = await prisma.subscriber.findMany({
        where: { isUnsub: false },
        select: { email: true, topics: true }
    });

    for (const user of activeSubscribers) {
        let htmlEmail = '<h1>Daily AI summary</h1>';
        for (const selectedTopic of user.topics) {
            htmlEmail += topicSummaryHtml.get(selectedTopic) || '';
        }

        console.log(`${user.email} - Email content generated`);
        console.log('FULL HTML:');
        console.log(htmlEmail);
    }

    process.exit(0);
}

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

                    let embedding = null;
                    try {
                        const textToEmbed = `${newsArticle.title || ""} ${cleanContent.slice(0, 2000)}`;
                        embedding = await generateEmbedding(textToEmbed);
                        console.log("Embedding generated for:", newsArticle.title);
                    } catch (err) {
                        console.error("Failed to generate embedding:", err);
                    }

                    let dateString = ''
                    if (newsArticle.publishedTime)
                        dateString = newsArticle.publishedTime
                    if (item.pubDate)
                        dateString = item.pubDate

                    const publishDate = dateString ? new Date(dateString) : new Date();

                    if (embedding) {
                        const embeddingStr = `[${embedding.join(',')}]`;
                        await prisma.$queryRaw`
                            INSERT INTO article (title, content, summary, url, source, "publish_at", metadata, embedding, topic)
                            VALUES (${newsArticle.title || "Untitled"}, ${newsArticle.textContent}, NULL, ${item.link}, ${site}, ${publishDate}, ${JSON.stringify({ site })}, ${embeddingStr}::vector, ${topic})
                        `;
                    } else {
                        await prisma.article.create({
                            data: {
                                url: item.link,
                                source: site,
                                title: newsArticle.title || "Untitled",
                                content: newsArticle.textContent,
                                summary: null,
                                metadata: { site: site },
                                topic: topic,
                                publishAt: publishDate,
                            }
                        });
                    }

                }
            } finally {
                dom.window.close();
            }
        }
    } catch (error) {
        console.error(`Failed:`, error);
    }
}

const getSummary = async (title: string, cleanContent: string): Promise<string | null> => {
    try {
        const response = await axios.post("http://localhost:11434/api/chat", {
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
            timeout: 60000
        });

        const rawContent = response.data.message?.content || '';
        const cleanedContent = rawContent
            .replace(/```html\s*/gi, '')
            .replace(/```\s*$/gm, '')
            .trim();
        
        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.summary || null;
            } catch (e) {
                console.error("JSON parse error:", e);
                return cleanedContent.replace(/\{[\s\S]*\}/, '').trim() || null;
            }
        }
        
        return cleanedContent || null;
    } catch (err) {
        console.error("Failed to get summary:", err);
        return null;
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


// Manual test run
(async () => {
    console.log(toISOStringHK() + " 📧 Generating and sending daily email...");
    await generateDailyDigest();
})();

export default router;