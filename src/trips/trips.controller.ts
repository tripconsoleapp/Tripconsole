import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TripOwnershipGuard } from './guards/trip-ownership.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, TripStatus } from '@prisma/client';

@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @UseGuards(JwtAuthGuard, TripOwnershipGuard)
  @Get(':id')
  getTrip(@Param('id') id: string) {
    return this.tripsService.getTripById(id);
  }

  @UseGuards(JwtAuthGuard, TripOwnershipGuard)
  @Roles(Role.ORGANIZER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Req() req,
    @Body() body: { status: TripStatus; version: number },
  ) {
    return this.tripsService.updateTripStatus(
      id,
      body.status,
      body.version,
      req.user.userid,
    );
  }
}
