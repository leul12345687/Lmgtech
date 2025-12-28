import { Module, Global } from '@nestjs/common';
import { ChapaService } from './chapa.service';
import { ChapaController } from './chapa.controller';
import { BookingModule } from '../booking/booking.module';
@Global() // ✅ makes this module global
@Module({
   imports: [BookingModule],
  providers: [ChapaService],
 
  exports: [ChapaService], // ✅ REQUIRED
   controllers: [ChapaController],
})
export class ChapaModule {}
