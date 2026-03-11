import { Test, TestingModule } from '@nestjs/testing';
import { AiAdminPortalService } from './ai_admin_portal.service';

describe('AiAdminPortalService', () => {
  let service: AiAdminPortalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiAdminPortalService],
    }).compile();

    service = module.get<AiAdminPortalService>(AiAdminPortalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
