import { Test, TestingModule } from '@nestjs/testing';
import { GettingandupdatingprofileController } from './gettingandupdatingprofile.controller';

describe('GettingandupdatingprofileController', () => {
  let controller: GettingandupdatingprofileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GettingandupdatingprofileController],
    }).compile();

    controller = module.get<GettingandupdatingprofileController>(GettingandupdatingprofileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
