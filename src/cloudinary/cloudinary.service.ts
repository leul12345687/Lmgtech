// src/cloudinary/cloudinary.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  async uploadImage(file: Express.Multer.File, folder = 'uploads'): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            console.error('❌ Cloudinary upload failed:', error);
            return reject(new InternalServerErrorException('Image upload failed.'));
          }

          // ✅ TypeScript now knows result is defined
          resolve(result.secure_url);
        },
      );

      // Stream the buffer to Cloudinary
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
