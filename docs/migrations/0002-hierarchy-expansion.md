# Hierarchy expansion: deployment and rollback

## What changes

Migration `0002_hierarchy_expansion` adds `Conference` and `District` and an
optional `Circuit.districtId`. It does not alter or delete existing Circuit,
Church, or Section records. Existing circuits remain usable without a district
until they are assigned.

## Deployment

1. Back up the database and confirm `prisma migrate status` is clean.
2. Run `npm run db:migrate:deploy`.
3. Deploy the API version containing the hierarchy endpoint.
4. Assign districts to existing circuits through the administration workflow or
   an audited data import; do not infer assignments from names.
5. Verify a known church resolves through `/api/v2/hierarchy/me`.

## Rollback

The application is compatible with unassigned circuits, so the preferred
rollback is to deploy the previous API before removing schema elements. Do not
drop the new tables if they contain real conference or district data.

For an unused migration only, the rollback SQL is:

```sql
ALTER TABLE `Circuit` DROP FOREIGN KEY `Circuit_districtId_fkey`;
DROP INDEX `Circuit_districtId_idx` ON `Circuit`;
ALTER TABLE `Circuit` DROP COLUMN `districtId`;
ALTER TABLE `District` DROP FOREIGN KEY `District_conferenceId_fkey`;
DROP TABLE `District`;
DROP TABLE `Conference`;
```

Once hierarchy records exist, rollback is a data-migration project and requires
an exported assignment map before any schema contraction.
