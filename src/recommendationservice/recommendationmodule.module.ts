import { Module,Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { RecommendationService } from './recommendationservice.service';
@Global() 
@Module({
  imports: [HttpModule],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}