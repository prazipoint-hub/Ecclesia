import { describe, expect, test } from 'vitest';
import { resolvePermissionNames, type RoleAssignment } from '../src/features/auth/permissions';

const assignment = (permissionNames: string[]): RoleAssignment => ({
  id: `assignment-${permissionNames.join('-')}`,
  sectionId: null,
  role: {
    id: 'role-id',
    name: 'Role',
    permissions: permissionNames.map((name) => ({ permission: { name } })),
  },
});

describe('database-derived auth permissions', () => {
  test('derives only assigned role permissions, without duplicates', () => {
    expect(resolvePermissionNames([
      assignment(['member:view', 'member:create']),
      assignment(['member:create', 'finance:view']),
    ])).toEqual(['finance:view', 'member:create', 'member:view']);
  });

  test('does not grant permissions to a user without active assignments', () => {
    expect(resolvePermissionNames([])).toEqual([]);
  });
});
