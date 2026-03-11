import { Test, TestingModule } from '@nestjs/testing';
import { AiAdminPortalController } from './ai_admin_portal.controller';

describe('AiAdminPortalController', () => {
  let controller: AiAdminPortalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiAdminPortalController],
    }).compile();

    controller = module.get<AiAdminPortalController>(AiAdminPortalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
