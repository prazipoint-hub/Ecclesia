import { createApp } from './app';
import { logger } from '@/config/logger';
import { notificationService } from '@/features/notifications/service';
import { savedReportService } from '@/features/reporting/service/saved';

const port = Number(process.env.PORT || 4000);

const app = createApp();

app.listen(port, () => {
  logger.info(`Ecclesia API listening on http://localhost:${port}`);
});

// Optional: sends scheduled broadcasts without an external cron job. Enable on exactly one instance.
if (process.env.BROADCAST_SCHEDULER === 'true') {
  setInterval(() => {
    notificationService.runDue().catch((error) => logger.error({ err: error }, 'Scheduled broadcast run failed'));
  }, 60_000).unref();
}

// Optional: runs scheduled reports without an external cron job. Enable on exactly one instance.
if (process.env.REPORT_SCHEDULER === 'true') {
  setInterval(() => {
    savedReportService.runDue().catch((error) => logger.error({ err: error }, 'Scheduled report run failed'));
  }, 5 * 60_000).unref();
}
