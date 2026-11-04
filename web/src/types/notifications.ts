export type NotificationCategory = 'GIVING' | 'EVENTS' | 'ANNOUNCEMENTS' | 'PASTORAL';
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

export interface PreferenceChannel {
  channel: NotificationChannel;
  enabled: boolean;
  isDefault: boolean;
  available: boolean;
}

export interface PreferencesResponse {
  categories: Array<{ category: NotificationCategory; channels: PreferenceChannel[] }>;
}

export interface CommunicationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateList {
  variables: string[];
  items: CommunicationTemplate[];
}

export type BroadcastStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type BroadcastChannel = 'IN_APP' | 'EMAIL' | 'SMS';

export type Audience = { type: 'ALL' } | { type: 'SECTIONS' | 'ORGANIZATIONS'; ids: string[] };

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  audience: Audience;
  channels: BroadcastChannel[];
  status: BroadcastStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
}

export interface BroadcastList {
  items: Broadcast[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BroadcastInput {
  title: string;
  body: string;
  category: NotificationCategory;
  audience: Audience;
  channels: BroadcastChannel[];
}

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  GIVING: 'Giving & receipts',
  EVENTS: 'Events',
  ANNOUNCEMENTS: 'Announcements',
  PASTORAL: 'Pastoral care',
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'In-app',
  EMAIL: 'Email',
  SMS: 'SMS',
  PUSH: 'Push',
};

export const CHANNEL_NOTES: Partial<Record<NotificationChannel, string>> = {
  SMS: 'not available yet',
  PUSH: 'coming soon',
};

export const can = (permissions: string[] | undefined, permission: string): boolean => Boolean(permissions?.includes(permission));
