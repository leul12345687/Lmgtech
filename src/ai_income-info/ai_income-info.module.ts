import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiService } from './ai_income-info.service';

@Global() 
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  providers: [AiService],
  exports: [AiService], // 👈 important so other modules can use it
})
export class AiIncomeInfoModule {}   
