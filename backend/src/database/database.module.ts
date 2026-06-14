import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * DatabaseModule global: expone PrismaService (incluido su helper de contexto
 * de actor `runAsActor` / `runAsBot`) a toda la app sin re-importarlo en cada
 * módulo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
