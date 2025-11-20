import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigModule } from '@nestjs/config';

@Global() // ← Makes this module available globally
@Module({
  imports: [ConfigModule],
  providers: [MailService],
  exports: [MailService], // ← Export so other modules can use it
})
export class NotificationsModule {}
