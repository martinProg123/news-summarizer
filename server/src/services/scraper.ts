import axios from 'axios';
import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { prisma } from '../db';
import { getRandomUserAgent, randomWait } from '../utils/http';
import { generateEmbedding } from './embedding';

const rssParser = new Parser({
    headers: {
        'User-Agent': getRandomUserAgent() as string,
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
});

export const scrapeNewsFromRSS = async (feedsUrl: string, site: string, topic: string) => {
    try {
        const response = await axios.get(feedsUrl, {
            headers: {
                'User-Agent': getRandomUserAgent() as string,
                'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
            }
        });

        const feed = await rssParser.parseString(response.data);
        console.log(feedsUrl)

        for (const item of feed.items) {
            if (!item.link) continue;

            const existing = await prisma.article.findUnique({
                where: { url: item.link },
                select: { id: true }
            });

            if (existing) continue;

            await randomWait(5000, 20000);

            const { data: html } = await axios.get(item.link, {
                headers: {
                    'User-Agent': getRandomUserAgent() as string,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://www.google.com/',
                },
                timeout: 10000,
            });

            console.log(`after axios`)
            const dom = new JSDOM(html, { url: item.link });
            try {
                const reader = new Readability(dom.window.document);
                const newsArticle = reader.parse();

                if (newsArticle && newsArticle.textContent) {
                    const cleanContent = newsArticle.textContent.trim();

                    let embedding = null;
                    try {
                        const textToEmbed = `${newsArticle.title || ""} ${cleanContent.slice(0, 2000)}`;
                        embedding = await generateEmbedding(textToEmbed);
                        console.log(newsArticle.title+ ` after embedding`)
                    } catch (err) {
                        console.error("Failed to generate embedding:", err);
                    }

                    let dateString = '';
                    if (newsArticle.publishedTime) {
                        dateString = newsArticle.publishedTime;
                    }
                    if (item.pubDate) {
                        dateString = item.pubDate;
                    }

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
};
