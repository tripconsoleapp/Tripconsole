import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripStatus,AuditAction } from '@prisma/client';
import { TripStateTransitions } from './trip-state-machine';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

  getTripById(id: string) {
    return this.prisma.trip.findUnique({
      where: { id },
    });
  }

  async updateTripStatus(
    tripId: string,
    newStatus: TripStatus,
    expectedVersion: number,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        throw new NotFoundException('Trip not found');
      }

      // 🔐 VERSION CHECK
      if (trip.version !== expectedVersion) {
        throw new ConflictException(
          `Version mismatch. Current version is ${trip.version}`,
        );
      }

      // 🔄 STATE TRANSITION CHECK
      const allowedTransitions = TripStateTransitions[trip.status];

      if (!allowedTransitions.includes(newStatus)) {
        throw new ForbiddenException(
          `Invalid status transition from ${trip.status} to ${newStatus}`,
        );
      }

      // ✅ UPDATE TRIP
      const updatedTrip = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: newStatus,
          version: { increment: 1 },
        },
      });

      // 📝 INSERT AUDIT LOG
      await tx.auditLog.create({
        data: {
          action: AuditAction.STATUS_UPDATED,
          userId,
          entityType: 'Trip',
          entityId: tripId,
          previousState: { status: trip.status, version: trip.version },
          newState: { status: newStatus, version: updatedTrip.version },
        },
      });

      return updatedTrip;
    });
  }
}
