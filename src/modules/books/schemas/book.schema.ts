import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookStatus } from '../../../common/enums/book-status.enum';
import { SubmissionStatus } from '../../../common/enums/submission-status.enum';

export type BookDocument = Book & Document;

@Schema({ timestamps: true })
export class Book {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ type: Types.ObjectId, ref: 'Author', required: true })
  authorId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Genre' }], default: [] })
  genreIds: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Series', default: null })
  seriesId: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  volumeNumber: number | null;

  @Prop({ required: true })
  description: string;

  @Prop({ default: '' })
  shortStory: string;

  @Prop({ type: Date, default: null })
  releaseDate: Date | null;

  @Prop({ type: Number, default: null })
  pageCount: number | null;

  @Prop({ default: false })
  isLocked: boolean;

  @Prop({ type: String, default: null })
  coverImageUrl: string | null;

  @Prop({ type: String, default: null })
  fileUrl: string | null;

  @Prop({ type: String, default: null })
  fileKey: string | null;

  @Prop({ type: String, default: null })
  fileMimeType: string | null;

  @Prop({ type: Number, default: null })
  fileSizeBytes: number | null;

  @Prop({ type: String, enum: BookStatus, default: BookStatus.DRAFT })
  status: BookStatus;

  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organizationId: Types.ObjectId | null;

  @Prop({ type: String, enum: Object.values(SubmissionStatus), default: undefined })
  submissionStatus?: SubmissionStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  submittedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  submittedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  reviewNote: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt: Date | null;

  @Prop({ type: String, default: null })
  isbn: string | null;

  @Prop({ default: '' })
  language: string;

  @Prop({ default: '' })
  imprint: string;

  @Prop({ type: Number, default: 1 })
  version: number;

  @Prop({ type: Date, default: null })
  takedownRequestedAt: Date | null;

  @Prop({ type: Date, default: null })
  takenDownAt: Date | null;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const BookSchema = SchemaFactory.createForClass(Book);
BookSchema.index(
  { title: 'text', description: 'text' },
  { default_language: 'english', language_override: 'textLanguage' },
);
BookSchema.index({ status: 1, deletedAt: 1, releaseDate: 1 });
BookSchema.index({ organizationId: 1, submissionStatus: 1 });
BookSchema.index({ isbn: 1 }, { unique: true, sparse: true });
