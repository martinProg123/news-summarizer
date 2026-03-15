(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import express from "express";
import cors from 'cors';
import { subscriberRouter } from './routes';
import { startCronJobs } from './jobs';

const app = express();

const corsOptions = {
    origin: `http://localhost:5173'}`,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(subscriberRouter);

const PORT = '3333';
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

startCronJobs();

export default app;
