import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { assertUploadFile } from './upload-rules';

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
    const ext = path.extname(file.originalname || '').toLowerCase();
    const key = `${folder}/${randomUUID()}${ext}`;
    const fullPath = path.join(this.uploadPath, key);
    if (file.buffer?.length) {
      await fs.promises.writeFile(fullPath, file.buffer);
    } else if (file.path) {
      await fs.promises.copyFile(file.path, fullPath);
      await fs.promises.unlink(file.path).catch(() => undefined);
    } else {
      throw new BadRequestException({
        message: 'The file is empty.',
        code: 'FILE_INVALID',
      });
    }
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

  assert(file: Express.Multer.File, kind: 'book' | 'cover') {
    const configured = Number(this.configService.get('MAX_FILE_SIZE_MB', 50));
    const maxMb = Number.isFinite(configured) && configured > 0 ? configured : 50;
    assertUploadFile(file, kind, maxMb * 1024 * 1024);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  getAbsolutePath(key: string): string {
    return this.provider.getAbsolutePath(key);
  }
}
