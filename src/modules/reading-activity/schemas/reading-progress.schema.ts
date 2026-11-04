import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReadingProgressDocument = ReadingProgress & Document;

@Schema({ timestamps: true })
export class ReadingProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Book', required: true })
  bookId: Types.ObjectId;

  @Prop({ default: 0 })
  currentPage: number;

  @Prop({ default: 0 })
  totalPages: number;

  @Prop({ default: 0 })
  percentComplete: number;

  @Prop({ default: false })
  isCompleted: boolean;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ type: Date, default: Date.now })
  lastReadAt: Date;
}

export const ReadingProgressSchema =
  SchemaFactory.createForClass(ReadingProgress);
ReadingProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
