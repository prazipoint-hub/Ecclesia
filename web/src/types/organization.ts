export type OrganizationUnitType = 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT' | 'SECTION';

export type OrganizationStatus = 'ACTIVE' | 'INACTIVE';

export interface OrganizationUnit {
  id: string;
  name: string;
  displayName: string;
  type: OrganizationUnitType;
  parentId?: string;
  status: OrganizationStatus;
}
