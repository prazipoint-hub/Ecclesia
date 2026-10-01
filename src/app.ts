import express, { Application } from 'express';
import helmet from 'helmet';

import memberRoutes from '@/features/members/routes';
import familyRoutes from '@/features/families/routes';
import sectionRoutes from '@/features/sections/routes';
import organizationRoutes from '@/features/organizations/routes';
import membershipRoutes from '@/features/membership/routes';
import reportingRoutes from '@/features/reporting/routes';
import sectionFinanceRoutes from '@/features/finance/section/routes';
import mainChurchFinanceRoutes from '@/features/finance/main/routes';
import districtFinanceRoutes from '@/features/finance/district/routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v2/members', memberRoutes);
  app.use('/api/v2/families', familyRoutes);
  app.use('/api/v2/sections', sectionRoutes);
  app.use('/api/v2/organizations', organizationRoutes);
  app.use('/api/v2/membership', membershipRoutes);
  app.use('/api/v2/reports', reportingRoutes);
  app.use('/api/v2/sections', sectionFinanceRoutes);
  app.use('/api/v2/churches', mainChurchFinanceRoutes);
  app.use('/api/v2/circuits', districtFinanceRoutes);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
