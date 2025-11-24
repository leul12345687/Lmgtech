import { Test, TestingModule } from '@nestjs/testing';
import { GettingandupdatingprofileService } from './gettingandupdatingprofile.service';

describe('GettingandupdatingprofileService', () => {
  let service: GettingandupdatingprofileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GettingandupdatingprofileService],
    }).compile();

    service = module.get<GettingandupdatingprofileService>(GettingandupdatingprofileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
