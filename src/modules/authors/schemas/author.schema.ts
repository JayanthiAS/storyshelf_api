import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuthorDocument = Author & Document;

@Schema({ timestamps: true })
export class Author {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  bio: string;

  @Prop({ type: String, default: null })
  profileImageUrl: string | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const AuthorSchema = SchemaFactory.createForClass(Author);
