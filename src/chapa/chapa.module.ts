import { Module, Global } from '@nestjs/common';
import { ChapaService } from './chapa.service';

@Global() // ✅ makes this module global
@Module({
  providers: [ChapaService],
  exports: [ChapaService], // ✅ REQUIRED
})
export class ChapaModule {}
