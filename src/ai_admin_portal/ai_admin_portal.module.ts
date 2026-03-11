import { Module,Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiAdminService } from './ai_admin_portal.service';
import { AiAdminController } from './ai_admin_portal.controller';
@Global() 
@Module({
 imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  providers: [AiAdminService],
  controllers: [AiAdminController],
})
export class AiAdminModule {}