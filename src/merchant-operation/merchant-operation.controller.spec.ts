import { Test, TestingModule } from '@nestjs/testing';
import { MerchantOperationController } from './merchant-operation.controller';

describe('MerchantOperationController', () => {
  let controller: MerchantOperationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantOperationController],
    }).compile();

    controller = module.get<MerchantOperationController>(MerchantOperationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
