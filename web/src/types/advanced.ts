export interface Campaign {
  id: string; name: string; slug: string; description: string | null; status: 'DRAFT' | 'ACTIVE' | 'CLOSED'; isPublic: boolean; fundId: string;
  goalAmount: number; startDate: string; endDate: string | null; createdAt: string; raised: number; gifts: number; donors: number; percent: number;
}
export interface CampaignList { items: Campaign[]; total: number }
export interface PublicCampaign {
  name: string; description: string | null; fundId: string; goalAmount: number; raised: number; percent: number; donors: number;
  startDate: string; endDate: string | null; daysLeft: number | null;
}

export interface GroupSummary { id: string; name: string; meetingDay: string | null; meetingTime: string | null; location: string | null; status: string; capacity: number | null; memberCount: number }
export interface GroupMember { membershipId: string; memberId: string; name: string; membershipNumber: string; role: 'LEADER' | 'MEMBER'; joinedAt: string }
export interface GroupDetail {
  id: string; name: string; description: string | null; meetingDay: string | null; meetingTime: string | null; location: string | null;
  curriculumName: string | null; capacity: number | null; status: 'ACTIVE' | 'PAUSED' | 'CLOSED'; members: GroupMember[];
}
export interface GroupSessionRow { id: string; heldOn: string; topic: string; lesson: string | null; present: number; recorded: number }
export interface AttendanceSummary { sessions: number; members: Array<{ membershipId: string; memberId: string; name: string; recorded: number; present: number; rate: number | null }> }

export interface AssetCategory { id: string; name: string; assetCount: number }
export interface AssetRow { id: string; tag: string; name: string; category: string; location: string | null; status: 'ACTIVE' | 'IN_REPAIR' | 'RETIRED' }
export interface AssetMaintenance { id: string; performedOn: string; description: string; cost: number | null; nextDueDate: string | null }
export interface AssetDetail {
  id: string; tag: string; name: string; category: { id: string; name: string }; location: string | null; status: AssetRow['status'];
  purchaseDate: string | null; purchaseCost: number | null; serialNumber: string | null; notes: string | null; retiredAt: string | null; maintenance: AssetMaintenance[];
}
export interface DueMaintenance { assetId: string; tag: string; name: string; location: string | null; dueDate: string; overdue: boolean; lastWork: string }

export type DocumentType = 'CERTIFICATE' | 'LETTER' | 'MINUTES';
export interface DocumentTemplate { id: string; type: DocumentType; name: string; title: string; body: string; isActive: boolean }
export interface IssuedDocument { id: string; type: DocumentType; serial: string; title: string; memberId: string | null; voidedAt: string | null; createdAt: string }
export interface IssuedDocumentList { items: IssuedDocument[]; total: number }

export interface CalendarFeed { id: string; label: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
export interface CreatedCalendarFeed { id: string; label: string | null; path: string; token: string }

export const KNOWN_PLACEHOLDERS = ['memberName', 'memberFirstName', 'memberLastName', 'membershipNumber', 'churchName', 'date', 'serial'] as const;
/** Names of the `{{field.x}}` placeholders used in the given texts, in first-seen order. */
export const fieldPlaceholders = (...texts: string[]): string[] => {
  const out: string[] = [];
  for (const text of texts) for (const m of text.matchAll(/\{\{\s*field\.([A-Za-z][A-Za-z0-9]{0,29})\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
};
