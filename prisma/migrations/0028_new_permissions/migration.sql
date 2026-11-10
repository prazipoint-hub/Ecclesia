-- Data only. Permissions were previously created only by the seed script, so a deployed database lacks the ones added since.
-- Idempotent: existing names are left alone. The seeded 'Church Administrator' role receives them; other roles are untouched.
INSERT IGNORE INTO `Permission` (`id`, `name`) VALUES
  (UUID(), 'report:view:hierarchy'),
  (UUID(), 'member:profile:review'),
  (UUID(), 'member:profile:report'),
  (UUID(), 'member:profile:configure'),
  (UUID(), 'leadership:position:view'),
  (UUID(), 'leadership:position:manage'),
  (UUID(), 'leadership:import'),
  (UUID(), 'leadership:appointment:view'),
  (UUID(), 'leadership:appointment:manage'),
  (UUID(), 'leadership:appointment:approve'),
  (UUID(), 'finance:reconcile:manage'),
  (UUID(), 'finance:reconcile:complete'),
  (UUID(), 'finance:policy:manage'),
  (UUID(), 'finance:deposit:verify'),
  (UUID(), 'finance:deposit:record'),
  (UUID(), 'finance:cash_session:review'),
  (UUID(), 'circuit:view:all'),
  (UUID(), 'circuit:view'),
  (UUID(), 'circuit:register'),
  (UUID(), 'circuit:onboard'),
  (UUID(), 'access:preview'),
  (UUID(), 'access:assign:global'),
  (UUID(), 'access:assign');

INSERT IGNORE INTO `RolePermission` (`id`, `roleId`, `permissionId`)
SELECT UUID(), r.`id`, p.`id`
FROM `Role` r JOIN `Permission` p ON p.`name` IN ('report:view:hierarchy', 'member:profile:review', 'member:profile:report', 'member:profile:configure', 'leadership:position:view', 'leadership:position:manage', 'leadership:import', 'leadership:appointment:view', 'leadership:appointment:manage', 'leadership:appointment:approve', 'finance:reconcile:manage', 'finance:reconcile:complete', 'finance:policy:manage', 'finance:deposit:verify', 'finance:deposit:record', 'finance:cash_session:review', 'circuit:view:all', 'circuit:view', 'circuit:register', 'circuit:onboard', 'access:preview', 'access:assign:global', 'access:assign')
WHERE r.`name` = 'Church Administrator';
