import { z } from 'zod';

export const RequestMembershipStatusChangeSchema = z.object({
  memberId: z.string().uuid(),
  changeType: z.enum(['MARRIAGE', 'DIVORCE', 'DEATH', 'TRANSFER', 'OTHER']),
  proposedStatus: z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED']).optional(),
  reason: z.string().min(1, 'Reason required'),
  evidence: z.string().optional(),
  additionalInfo: z.record(z.any()).optional(),
});

export const ApproveStatusChangeSchema = z.object({
  requestId: z.string().uuid(),
  approved: z.boolean(),
  rejectionReason: z.string().optional(),
});

export const StatusChangeRequestResponseSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
  changeType: z.string(),
  proposedStatus: z.string().nullable(),
  currentStatus: z.string(),
  reason: z.string(),
  evidence: z.string().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
  requestedBy: z.string().uuid(),
  requestedAt: z.string().datetime(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().datetime().nullable(),
  rejectionReason: z.string().nullable(),
  additionalInfo: z.record(z.any()).nullable(),
});

export type RequestMembershipStatusChangeInput = z.infer<typeof RequestMembershipStatusChangeSchema>;
export type ApproveStatusChangeInput = z.infer<typeof ApproveStatusChangeSchema>;
export type StatusChangeRequestResponse = z.infer<typeof StatusChangeRequestResponseSchema>;
