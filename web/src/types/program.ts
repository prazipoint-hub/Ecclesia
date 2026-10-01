export type ProgramStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';

export interface Program {
  id: string;
  name: string;
  ownerCommitteeId: string;
  scopeId: string;
  status: ProgramStatus;
}
