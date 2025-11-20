import { Test, TestingModule } from '@nestjs/testing';
import { MerchantOperationService } from './merchant-operation.service';

describe('MerchantOperationService', () => {
  let service: MerchantOperationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MerchantOperationService],
    }).compile();

    service = module.get<MerchantOperationService>(MerchantOperationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
