import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from './config/config.module';
import { RedisModule } from './common/services/redis.module';
import { RabbitMQModule } from './common/services/rabbitmq.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuthorsModule } from './modules/authors/authors.module';
import { GenresModule } from './modules/genres/genres.module';
import { SeriesModule } from './modules/series/series.module';
import { BooksModule } from './modules/books/books.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ReadingActivityModule } from './modules/reading-activity/reading-activity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SearchModule } from './modules/search/search.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { WorkersModule } from './workers/workers.module';
import { SeedModule } from './seed/seed.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    AppConfigModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/storyshelf',
        ),
      }),
    }),
    RedisModule,
    RabbitMQModule,
    UploadsModule,
    AuthModule,
    UsersModule,
    AuthorsModule,
    GenresModule,
    SeriesModule,
    BooksModule,
    SubscriptionsModule,
    ReadingActivityModule,
    NotificationsModule,
    RecommendationsModule,
    SearchModule,
    AdminModule,
    HealthModule,
    WorkersModule,
    SeedModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
