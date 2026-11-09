import express, { Application, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import assetRoutes from '@/features/assets/routes';
import documentRoutes from '@/features/documents/routes';
import smallGroupRoutes from '@/features/smallGroups/routes';
import { campaignRoutes, publicCampaignRoutes } from '@/features/campaigns/routes';
import { calendarRoutes, publicCalendarRoutes } from '@/features/calendar/routes';
import { logger } from '@/config/logger';

import memberRoutes from '@/features/members/routes';
import { paymentRoutes, pledgeRoutes, recurringGivingRoutes, paymentMethodRoutes } from '@/features/payments/routes';
import notificationRoutes from '@/features/notifications/routes';
import memberDirectoryRoutes from '@/features/members/routes/directory';
import visitorRoutes from '@/features/visitors/routes';
import committeeMeetingRoutes from '@/features/committees/routes/meetings';
import leadershipRoutes from '@/features/leadership/routes';
import leadershipRegisterRoutes from '@/features/leadership/routes/register';
import accountingRoutes from '@/features/accounting/routes';
import myAccountRoutes from '@/features/members/routes/me';
import { mine as profileMineRoutes, admin as profileAdminRoutes } from '@/features/members/routes/profile';
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
import accessRoutes from '@/features/access/routes';
import pastoralCaseRoutes from '@/features/pastoral/cases/routes';
import pastoralCareRoutes from '@/features/pastoral/care/routes';
import eventRoutes from '@/features/events/routes';
import eventEngagementRoutes from '@/features/events/routes/engagement';
import committeeRoutes from '@/features/committees/routes';
import adminRoutes from '@/features/admin/routes';
import { buildOpenApi } from '@/features/admin/service/apiReference';

export function createApp(): Application {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
  }
  // Calendar links carry a secret in the URL, so it is masked before the request line reaches the logs.
  app.use(
    pinoHttp({
      logger,
      serializers: { req: (req) => { const out = pino.stdSerializers.req(req); return { ...out, url: String(out.url).replace(/(\/public\/calendar\/)[^/?#]+/, '$1[redacted]') }; } },
    })
  );
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Every router is registered through here so the API reference can list the real routes.
  const mounts: Array<{ path: string; router: Router }> = [];
  const mount = (path: string, router: Router) => {
    mounts.push({ path, router });
    app.use(path, router);
  };
  app.locals.apiMounts = mounts;

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  mount('/api/v1/auth', authRoutes);
  mount('/api/v2/hierarchy', hierarchyRoutes);
  mount('/api/v2/access', accessRoutes);
  mount('/api/v2/pastoral/cases', pastoralCaseRoutes);
  mount('/api/v2/pastoral', pastoralCareRoutes);
  mount('/api/v2/events', eventEngagementRoutes);
  mount('/api/v2/events', eventRoutes);
  mount('/api/v2/committees', committeeMeetingRoutes);
  mount('/api/v2/committees', committeeRoutes);

  mount('/api/v2/me/profile-completion', profileMineRoutes);
  mount('/api/v2/me', myAccountRoutes);
  mount('/api/v2/profile-admin', profileAdminRoutes);
  mount('/api/v2/notifications', notificationRoutes);
  mount('/api/v2/visitors', visitorRoutes);
  mount('/api/v2/leadership', leadershipRoutes);
  mount('/api/v2/leadership-register', leadershipRegisterRoutes);
  mount('/api/v2/accounting', accountingRoutes);
  mount('/api/v2/payments', paymentRoutes);
  mount('/api/v2/pledges', pledgeRoutes);
  mount('/api/v2/recurring-giving', recurringGivingRoutes);
  mount('/api/v2/payment-methods', paymentMethodRoutes);
  mount('/api/v2/members', memberDirectoryRoutes);
  mount('/api/v2/members', memberRoutes);
  mount('/api/v2/families', familyRoutes);
  mount('/api/v2/sections', sectionRoutes);
  mount('/api/v2/organizations', organizationRoutes);
  mount('/api/v2/membership', membershipRoutes);
  mount('/api/v2/reports', reportingRoutes);
  mount('/api/v2/admin', adminRoutes);
  mount('/api/v2/campaigns', campaignRoutes);
  mount('/api/v2/calendar', calendarRoutes);
  mount('/api/v2/groups', smallGroupRoutes);
  mount('/api/v2/assets', assetRoutes);
  mount('/api/v2/documents', documentRoutes);
  mount('/api/v2/public', publicCampaignRoutes);
  mount('/api/v2/public', publicCalendarRoutes);
  // Finance controllers depend on the owning unit id from route params. Mount
  // them beneath that resource so the params are always available.
  mount('/api/v2/sections/:sectionId/finance', sectionFinanceRoutes);
  mount('/api/v2/churches/:churchId', mainChurchFinanceRoutes);
  mount('/api/v2/circuits/:circuitId', circuitFinanceRoutes);
  mount('/api/v2/districts/:districtId', districtFinanceRoutes);

  // Machine-readable route list for tools such as Postman. Off in production unless API_DOCS=true.
  if (process.env.NODE_ENV !== 'production' || process.env.API_DOCS === 'true') {
    app.get('/api/docs.json', (_req, res) => {
      res.json(buildOpenApi(mounts));
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled application error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
