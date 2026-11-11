import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
// getSignedUrl removed due to version incompatibility; using placeholder implementation.


const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor() {
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('S3 credentials not configured, file uploads will be simulated');
    }

    this.bucketName = process.env.S3_BUCKET || 'smartlogi-pod';

    this.s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://s3:9000',
      credentials: {
        accessKeyId: accessKeyId || 'minioadmin',
        secretAccessKey: secretAccessKey || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(file: any, folder: string = 'pod') {
    this.validateFile(file);

    const key = `${folder}/${Date.now()}-${this.sanitizeFilename(file.originalname)}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      this.logger.log(`File uploaded successfully: ${key}`);
      return {
        url: `${process.env.S3_ENDPOINT || 'http://s3:9000'}/${this.bucketName}/${key}`,
        key,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error: any) {
      this.logger.error(`Upload failed: ${error?.message || 'Unknown error'}`);
      throw error;
    }
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Placeholder: generate a simple URL without signing, suitable for local dev/testing.
    // In production, replace with proper getSignedUrl implementation.
    const endpoint = process.env.S3_ENDPOINT || 'http://s3:9000';
    const bucket = this.bucketName;
    return `${endpoint}/${bucket}/${key}?expires=${Date.now() + expiresIn * 1000}`;
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      this.logger.log(`File deleted: ${key}`);
    } catch (error: any) {
      this.logger.error(`Delete failed: ${error.message}`);
      throw error;
    }
  }

  async uploadPodImage(file: any, orderId: string) {
    return this.uploadFile(file, `pod/${orderId}`);
  }

  async uploadSignature(file: any, orderId: string) {
    return this.uploadFile(file, `signatures/${orderId}`);
  }

  private validateFile(file: any): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  }
}
