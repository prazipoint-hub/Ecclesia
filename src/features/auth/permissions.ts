export type RoleAssignment = {
  id: string;
  sectionId: string | null;
  role: {
    id: string;
    name: string;
    permissions: Array<{ permission: { name: string } }>;
  };
};

export const activeAssignments = (assignments: RoleAssignment[]) => assignments;

export const resolvePermissionNames = (assignments: RoleAssignment[]) =>
  [...new Set(activeAssignments(assignments).flatMap((assignment) => assignment.role.permissions.map(({ permission }) => permission.name)))].sort();
