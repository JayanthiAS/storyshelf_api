import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GenreDocument = Genre & Document;

@Schema({ timestamps: true })
export class Genre {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const GenreSchema = SchemaFactory.createForClass(Genre);
