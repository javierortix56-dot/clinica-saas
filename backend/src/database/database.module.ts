import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * DatabaseModule global: expone PrismaService a toda la app sin necesidad de
 * re-importarlo en cada módulo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
