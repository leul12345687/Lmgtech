import { Test, TestingModule } from '@nestjs/testing';
import { OperationCustomerController } from './operation-customer.controller';

describe('OperationCustomerController', () => {
  let controller: OperationCustomerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OperationCustomerController],
    }).compile();

    controller = module.get<OperationCustomerController>(OperationCustomerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
