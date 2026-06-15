import { Module } from '@nestjs/common';
import { ConsultarCatalogoHandler } from './handlers/consultar-catalogo.handler';
import { ConsultarPoliticasHandler } from './handlers/consultar-politicas.handler';

/**
 * CatalogModule — handlers de tools de catálogo/políticas: `consultar_catalogo`
 * y `consultar_politicas_clinica` (sintetizado de columnas/triggers).
 * Exporta los handlers para que `AiModule` arme el registro `TOOL_HANDLERS`.
 */
@Module({
  providers: [ConsultarCatalogoHandler, ConsultarPoliticasHandler],
  exports: [ConsultarCatalogoHandler, ConsultarPoliticasHandler],
})
export class CatalogModule {}
