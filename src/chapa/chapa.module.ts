import { Module, Global } from '@nestjs/common';
import { ChapaService } from './chapa.service';
import { ChapaController } from './chapa.controller';

@Global() // ✅ makes this module global
@Module({

  providers: [ChapaService],
 
  exports: [ChapaService], // ✅ REQUIRED
   controllers: [ChapaController],
})
export class ChapaModule {}
