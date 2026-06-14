import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validate } from './env.validation';

/**
 * ConfigModule global: carga `.env`, valida contra EnvironmentVariables y
 * expone ConfigService en toda la app.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: '.env',
    }),
  ],
})
export class ConfigModule {}
