export interface Program {
  id: string;
  name: string;
  ownerCommitteeId: string;
  scopeId: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  description?: string;
  startDate?: string;
  endDate?: string;
}
