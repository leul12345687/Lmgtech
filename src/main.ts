import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
app.enableCors({
origin: [
'http://localhost:5173',
  'https://customer-portal-111.onrender.com',
"https://customer-portal-1.onrender.com",
"https://lmgsystem-tau.vercel.app",
"https://smart-merchant-portal.onrender.com",
"https://lmgsystem-p7z3.vercel.app",
"https://lmg-system.onrender.com",
"https://lmg-system-bfyr.onrender.com",
"https://lmg-merchant-portal.vercel.app",
"https://lmg-admin-portal.vercel.app"
],
credentials: true,
methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
});

  // Uploads folder
  const uploadsDir = join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Port for Render
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 App running on port: ${port}`);
}

bootstrap();