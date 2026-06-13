import slugify from 'slugify';

export function toSlug(text: string): string {
  return slugify(text, { lower: true, strict: true });
}

export function generateOtp(defaultOtp?: string): string {
  if (defaultOtp) {
    return defaultOtp;
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}
