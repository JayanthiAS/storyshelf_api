import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BookLikeDocument = BookLike & Document;

@Schema({ timestamps: true })
export class BookLike {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Book', required: true })
  bookId: Types.ObjectId;
}

export const BookLikeSchema = SchemaFactory.createForClass(BookLike);
BookLikeSchema.index({ userId: 1, bookId: 1 }, { unique: true });
