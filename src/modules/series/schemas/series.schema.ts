import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SeriesDocument = Series & Document;

@Schema({ timestamps: true })
export class Series {
  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: Number, default: null })
  totalVolumes: number | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const SeriesSchema = SchemaFactory.createForClass(Series);
