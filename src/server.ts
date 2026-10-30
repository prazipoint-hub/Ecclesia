import { createApp } from './app';
import { logger } from '@/config/logger';

const port = Number(process.env.PORT || 4000);

const app = createApp();

app.listen(port, () => {
  logger.info(`Ecclesia API listening on http://localhost:${port}`);
});
