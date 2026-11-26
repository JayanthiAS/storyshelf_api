import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

const BOOK_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf', 'application/x-pdf'],
  '.epub': ['application/epub+zip', 'application/octet-stream'],
};

const COVER_TYPES: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
};

export function assertUploadFile(
  file: Express.Multer.File,
  kind: 'book' | 'cover',
  maxBytes: number,
) {
  if (!file || file.size <= 0) {
    throw new BadRequestException({
      message: 'The file is empty.',
      code: 'FILE_INVALID',
    });
  }
  if (file.size > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    throw new BadRequestException({
      message: `File exceeds the ${mb} MB limit.`,
      code: 'FILE_TOO_LARGE',
    });
  }
  const extension = extname(file.originalname || '').toLowerCase();
  const allowed = kind === 'book' ? BOOK_TYPES : COVER_TYPES;
  const mimeTypes = allowed[extension];
  if (!mimeTypes || !mimeTypes.includes(file.mimetype)) {
    const expected = kind === 'book' ? 'PDF or EPUB' : 'JPEG, PNG, or WebP';
    throw new BadRequestException({
      message: `Use a ${expected} file. The extension and file type must match.`,
      code: 'FILE_TYPE',
    });
  }
}
