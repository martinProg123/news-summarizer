import { prisma } from '../db';

export const deleteOldArticles = async () => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);

    try {
        const deleted = await prisma.article.deleteMany({
            where: {
                publishAt: {
                    lt: threshold,
                },
            },
        });
        console.log(`🧹 Cleaned up ${deleted.count} old articles.`);
    } catch (error) {
        console.error("Cleanup failed:", error);
    }
};

export const deleteUnSub = async () => {
    try {
        const deleted = await prisma.subscriber.deleteMany({
            where: {
                isUnsub: true,
            },
        });
        console.log(`🧹 Cleaned up ${deleted.count} unsub.`);
    } catch (error) {
        console.error("Cleanup failed:", error);
    }
};
