import { Module } from '@nestjs/common';
import { PokeController } from './poke.controller';
import { PokeService } from './poke.service';

@Module({
  controllers: [PokeController],
  providers: [PokeService],
  exports: [PokeService],
})
export class PokeModule {}
