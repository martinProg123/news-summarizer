import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

const router = Router();
const emailSchema = z.string().email("Invalid email format");

router.post("/subEmail", async (req, res) => {
    try {
        const { topicArr, userEmail, duration } = req.body;
        if (!userEmail || !duration || topicArr.size === 0)
            res.status(400).json({ error: "Input cannot be empty" });

        const emailCheck = emailSchema.safeParse(userEmail);
        if (!emailCheck.success)
            res.status(400).json({ error: emailCheck.error.message });

        const result = await prisma.subscriber.upsert({
            where: { email: userEmail },
            update: {
                isUnsub: false,
                topics: topicArr,
            },
            create: {
                email: userEmail,
                topics: topicArr,
                sentFreq: duration,
            }
        });
        res.status(200).json(result.id);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/unsub", async (req, res) => {
    try {
        const { userEmail } = req.body;

        const emailCheck = emailSchema.safeParse(userEmail);
        if (!emailCheck.success)
            res.status(400).json({ error: emailCheck.error.message });
        
        const deleteUser = await prisma.subscriber.update({
            where: { email: userEmail },
            data: {
                isUnsub: true
            }
        });

        console.log('deleteUser: ' + deleteUser);
        if (!deleteUser) return res.status(404).json({ error: "User not found" });

        res.json(deleteUser);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
