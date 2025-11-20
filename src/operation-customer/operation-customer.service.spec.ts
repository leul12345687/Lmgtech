import { Test, TestingModule } from '@nestjs/testing';
import { OperationCustomerService } from './operation-customer.service';

describe('OperationCustomerService', () => {
  let service: OperationCustomerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OperationCustomerService],
    }).compile();

    service = module.get<OperationCustomerService>(OperationCustomerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
