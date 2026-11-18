import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';

export type LoginActivityDocument = LoginActivity & Document;

@Schema({ timestamps: true })
export class LoginActivity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Role, required: true })
  role: Role;

  @Prop({ type: Date, required: true })
  loggedInAt: Date;
}

export const LoginActivitySchema = SchemaFactory.createForClass(LoginActivity);
LoginActivitySchema.index({ loggedInAt: 1, userId: 1 });
