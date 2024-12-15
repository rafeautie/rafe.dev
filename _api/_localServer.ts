import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express, { Request, Response } from 'express';
import { getController as getStats } from './stats';

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));

app.get('/api/stats', async (_req: Request, res: Response) => {
  res.send(await getStats());
});

const port = 3002;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.on('error', (err) => console.error(err));

process.on('uncaughtException', (err) => {
  console.error(err);
});
