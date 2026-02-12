import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TripOwnershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const tripId = request.params.id;

    if (!tripId) {
      throw new ForbiddenException('Trip ID not provided');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { organizerId: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.organizerId !== user.userId) {
      throw new ForbiddenException('You do not own this trip');
    }

    return true;
  }
}
