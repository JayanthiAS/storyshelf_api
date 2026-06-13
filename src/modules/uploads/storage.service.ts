import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getAbsolutePath(key: string): string;
}

@Injectable()
class LocalStorageProvider implements StorageProvider {
  private uploadPath: string;

  constructor(private configService: ConfigService) {
    this.uploadPath = this.configService.get<string>('UPLOAD_PATH', './uploads');
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadResult> {
    const dir = path.join(this.uploadPath, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const ext = path.extname(file.originalname);
    const key = `${folder}/${randomUUID()}${ext}`;
    const fullPath = path.join(this.uploadPath, key);
    fs.writeFileSync(fullPath, file.buffer);
    return {
      url: `/uploads/${key}`,
      key,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.uploadPath, key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  getAbsolutePath(key: string): string {
    return path.join(this.uploadPath, key);
  }
}

@Injectable()
export class StorageService {
  private provider: StorageProvider;

  constructor(private configService: ConfigService) {
    const type = this.configService.get<string>('STORAGE_TYPE', 'local');
    if (type === 'local') {
      this.provider = new LocalStorageProvider(configService);
    } else {
      this.provider = new LocalStorageProvider(configService);
    }
  }

  upload(file: Express.Multer.File, folder: string): Promise<UploadResult> {
    return this.provider.upload(file, folder);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  getAbsolutePath(key: string): string {
    return this.provider.getAbsolutePath(key);
  }
}
