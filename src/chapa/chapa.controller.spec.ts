import { Test, TestingModule } from '@nestjs/testing';
import { ChapaController } from './chapa.controller';

describe('ChapaController', () => {
  let controller: ChapaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChapaController],
    }).compile();

    controller = module.get<ChapaController>(ChapaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
