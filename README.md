# Storyshelf API

Digital book platform backend built with NestJS, MongoDB, Redis, RabbitMQ, and Stripe.

## Features

- **Roles:** Guest, User, Admin, Superadmin
- **Auth:** JWT, OTP verification (default `123456` in development), refresh tokens
- **Books:** CRUD, local file upload, release-date gating, locked content for subscribers
- **Subscriptions:** Free plan on registration, Stripe checkout, webhooks
- **Recommendations:** In-app notifications based on likes and reading behavior
- **Modules:** Authors, Genres, Series, Reading progress, Notifications, Search

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for MongoDB, Redis, RabbitMQ)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start infrastructure
docker compose up -d

# 4. Run the API
npm run start:dev
```

The API runs at `http://localhost:3000/api/v1`  
Swagger docs at `http://localhost:3000/api/docs`

## Default Superadmin

On first startup, a superadmin is seeded automatically:


| Field    | Value                       |
| -------- | --------------------------- |
| Email    | `superadmin@storyshelf.com` |
| Password | `SuperAdmin@123`            |


Configure via `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` in `.env`.

## Default OTP (Development)

When `NODE_ENV=development`, OTP codes default to `123456` (see `OTP_DEFAULT` in `.env`).

## Scripts


| Command              | Description         |
| -------------------- | ------------------- |
| `npm run start:dev`  | Start in watch mode |
| `npm run build`      | Compile TypeScript  |
| `npm run start:prod` | Run compiled app    |
| `npm test`           | Unit tests          |
| `npm run test:e2e`   | End-to-end tests    |
| `npm run lint`       | ESLint              |


## API Overview

All endpoints are prefixed with `/api/v1`. 

### Key endpoint groups


| Prefix             | Description                                 |
| ------------------ | ------------------------------------------- |
| `/auth`            | Register, login, OTP, password reset        |
| `/books`           | Public book catalog and content             |
| `/admin/*`         | Admin-only CRUD (users, books, plans, etc.) |
| `/subscriptions`   | User subscription management                |
| `/reading`         | Reading progress and sessions               |
| `/notifications`   | In-app notifications                        |
| `/recommendations` | Personalized book suggestions               |
| `/health`          | Health checks                               |


## Project Structure

```
src/
├── common/          # Guards, decorators, filters, Redis/RabbitMQ
├── config/          # Environment configuration
├── modules/         # Feature modules
├── workers/         # RabbitMQ background consumers
└── seed/            # Database seed (plans, superadmin)
```

## Infrastructure


| Service     | Port  | Purpose                                   |
| ----------- | ----- | ----------------------------------------- |
| MongoDB     | 27017 | Primary database                          |
| Redis       | 6379  | Cache, refresh tokens, OTP, rate limiting |
| RabbitMQ    | 5672  | Async notifications & recommendations     |
| RabbitMQ UI | 15672 | Management console                        |


## Book Access Rules

1. **Unlocked books** (after release date) — accessible by guests and users
2. **Locked books** — require active paid subscription
3. **Future release date** — not accessible until that date
4. **Admin** — bypasses all access checks

## File Storage

Books and covers are stored locally under `./uploads/` by default. Set `STORAGE_TYPE=s3` (future) to switch to AWS S3.

## License

