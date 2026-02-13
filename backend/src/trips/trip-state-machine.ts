import { TripStatus } from '@prisma/client';

export const TripStateTransitions: Record<TripStatus, TripStatus[]> = {
  DRAFT: [TripStatus.REVIEW, TripStatus.CANCELLED],
  REVIEW: [TripStatus.SUBMITTED, TripStatus.CANCELLED],
  SUBMITTED: [TripStatus.VERIFIED, TripStatus.CANCELLED],
  VERIFIED: [TripStatus.PAID, TripStatus.CANCELLED],
  PAID: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};
