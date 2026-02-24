import { Test, TestingModule } from '@nestjs/testing';
import { AiIncomeInfoService } from './ai_income-info.service';

describe('AiIncomeInfoService', () => {
  let service: AiIncomeInfoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiIncomeInfoService],
    }).compile();

    service = module.get<AiIncomeInfoService>(AiIncomeInfoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
