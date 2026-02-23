import { Module } from '@nestjs/common';
import { CompassController } from './compass.controller';
import { CompassService } from './compass.service';

@Module({
  controllers: [CompassController],
  providers: [CompassService],
  exports: [CompassService],
})
export class CompassModule {}
