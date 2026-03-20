import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { scrapeNewsFromRSS } from '../services/scraper';
import { generateDailyDigest } from '../services/email';
import { deleteOldArticles, deleteUnSub } from '../services/cleanup';
import { toISOStringHK } from '../utils/datetime';

const tasks: ScheduledTask[] = [];

const RSS_SOURCES = [
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
        ]
    }
];

export const startCronJobs = () => {
    tasks.push(
        cron.schedule('0 */6 * * *', async () => {
            console.log(toISOStringHK() + ' cron scrap...');

            await Promise.all(RSS_SOURCES.map(async (obj) => {
                for (const feed of obj.feeds) {
                    await scrapeNewsFromRSS(feed.url, obj.site, feed.topic);
                }
            }));

            console.log(toISOStringHK() + ' scrap END...');
        })
    );

    tasks.push(
        cron.schedule('0 1 * * *', async () => {
            console.log(`${toISOStringHK()} Starting database maintenance...`);
            await deleteOldArticles();
            await deleteUnSub();
        })
    );

    tasks.push(
        cron.schedule('0 8 * * *', async () => {
            console.log(toISOStringHK() + " Generating and sending daily email...");
            await generateDailyDigest();
        })
    );

    console.log('Cron jobs registered');
};

export function stopCronJobs() {
    for (const task of tasks) {
        task.stop();
    }
    console.log('Cron jobs stopped.');
}
