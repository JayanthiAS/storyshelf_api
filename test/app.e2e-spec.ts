import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Storyshelf API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health should return health status', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
  });

  it('GET /api/v1/subscription-plans should be public', () => {
    return request(app.getHttpServer())
      .get('/api/v1/subscription-plans')
      .expect(200);
  });

  it('POST /api/v1/auth/register should create a user', async () => {
    const email = `test-${Date.now()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeDefined();
  });
});
