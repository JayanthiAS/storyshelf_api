import { IsOptional, IsString, IsEnum, IsArray } from 'class-validator';
import { NotificationType } from '../../../common/enums/notification-type.enum';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  metadata?: Record<string, string>;
}

export class BroadcastNotificationDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  userIds?: string[];
}

export class QueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  isRead?: string;
}
