import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TripOwnershipGuard } from './guards/trip-ownership.guard';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [PrismaModule],
  providers: [TripsService, TripOwnershipGuard],
  exports: [TripOwnershipGuard],
  controllers: [TripsController],
})
export class TripsModule {}
