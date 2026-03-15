import axios from 'axios';
import { prisma } from '../db';
import { topicQueries } from '../config/constants';
import { overallSummarySystemprompt } from '../config/prompts';
import { generateEmbedding } from './embedding';
import { getSummary } from './summarizer';
import { toISOStringHK } from '../utils/datetime';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';

const mailerSend = new MailerSend({
    apiKey: process.env.MAILER_API as string,
});

interface ArticleWithSummary {
    title: string;
    url: string;
    summary: string;
    publishAt: Date;
}

const formatDate = (d: Date | string) => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const day = date.getDate();
    const month = date.toLocaleString('en-GB', { month: 'short', timeZone: 'Asia/Hong_Kong' });
    const year = date.getFullYear();
    const hours = date.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' });
    const minutes = date.toLocaleString('en-GB', { minute: '2-digit', timeZone: 'Asia/Hong_Kong' });
    return `${day} ${month} ${year} ${hours}:${minutes}`;
};

export const generateDailyDigest = async () => {
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
            console.log(toISOStringHK() + " overall sum start");
            const response = await axios.post("http://localhost:11434/api/chat", {
                "model": "gemma3:4b",
                "messages": [
                    { "role": "system", "content": overallSummarySystemprompt },
                    {
                        "role": "user",
                        "content": `### Task: Generate a unified digest.\n\n### Article Data:\n${combinedContent}\n\n--- ...`
                    }
                ],
                "stream": false
            }, { timeout: 120000 });
            console.log(toISOStringHK() + " overall sum end");

            const overallSummary = (response.data.message?.content
                .replace(/```html\s*/gi, '')
                .replace(/```\s*$/gm, '')
                .trim())
                || "Summary unavailable.";

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

    console.log(`${activeSubscribers.length} - activeSubscribers `);
    const sentFrom = new Sender(process.env.MAILER_EMAIL as string, "Martin");

    for (const user of activeSubscribers) {
        let htmlEmail = '<h1>Daily AI summary</h1>';

        const recipients = [
            new Recipient(user.email, "Dear Subscriber")
        ];
        for (const selectedTopic of user.topics) {
            htmlEmail += topicSummaryHtml.get(selectedTopic) || '';
        }

        try {
            const emailParams = new EmailParams()
                .setFrom(sentFrom)
                .setTo(recipients)
                .setReplyTo(sentFrom)
                .setSubject("Daily News Summary")
                .setHtml(htmlEmail);

            const res = await mailerSend.email.send(emailParams);

            console.log(`send email success`);
            console.log(res);
        } catch (err) {
            console.log(`error in send email `);
            console.log(JSON.stringify(err));
        }
    }

    process.exit(0);
};
