import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import memberRoutes from '@/features/members/routes';
import familyRoutes from '@/features/families/routes';
import sectionRoutes from '@/features/sections/routes';
import organizationRoutes from '@/features/organizations/routes';
import membershipRoutes from '@/features/membership/routes';
import reportingRoutes from '@/features/reporting/routes';
import sectionFinanceRoutes from '@/features/finance/section/routes';
import mainChurchFinanceRoutes from '@/features/finance/main/routes';
import circuitFinanceRoutes from '@/features/finance/circuit/routes';
import districtFinanceRoutes from '@/features/finance/district/routes';
import authRoutes from '@/features/auth/routes';
import hierarchyRoutes from '@/features/hierarchy/routes';
import pastoralCaseRoutes from '@/features/pastoral/cases/routes';
import eventRoutes from '@/features/events/routes';
import committeeRoutes from '@/features/committees/routes';

export function createApp(): Application {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v2/hierarchy', hierarchyRoutes);
  app.use('/api/v2/pastoral/cases', pastoralCaseRoutes);
  app.use('/api/v2/events', eventRoutes);
  app.use('/api/v2/committees', committeeRoutes);

  app.use('/api/v2/members', memberRoutes);
  app.use('/api/v2/families', familyRoutes);
  app.use('/api/v2/sections', sectionRoutes);
  app.use('/api/v2/organizations', organizationRoutes);
  app.use('/api/v2/membership', membershipRoutes);
  app.use('/api/v2/reports', reportingRoutes);
  // Finance controllers depend on the owning unit id from route params. Mount
  // them beneath that resource so the params are always available.
  app.use('/api/v2/sections/:sectionId/finance', sectionFinanceRoutes);
  app.use('/api/v2/churches/:churchId', mainChurchFinanceRoutes);
  app.use('/api/v2/circuits/:circuitId', circuitFinanceRoutes);
  app.use('/api/v2/districts/:districtId', districtFinanceRoutes);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
