import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReadingSessionDocument = ReadingSession & Document;

@Schema({ timestamps: true })
export class ReadingSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Book', required: true })
  bookId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Genre' }], default: [] })
  genreIds: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Author', required: true })
  authorId: Types.ObjectId;

  @Prop({ required: true })
  durationSeconds: number;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ required: true })
  endedAt: Date;
}

export const ReadingSessionSchema =
  SchemaFactory.createForClass(ReadingSession);
ReadingSessionSchema.index({ userId: 1 });
