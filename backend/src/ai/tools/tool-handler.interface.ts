import { ToolContext } from './tool-context';
import { ToolResult } from './tool-result';
import { ToolName } from './tool-declarations';

/**
 * Contrato de un handler de tool real (blueprint Paso 5 §3).
 *
 * Reemplaza los stubs estáticos del Paso 4: cada tool es ahora un provider
 * inyectable (con acceso a PrismaService y servicios de dominio) que vive en su
 * módulo (`PatientsModule` / `CatalogModule` / `SchedulingModule`). El
 * `ToolExecutorService` enruta por `name` y delega.
 */
export interface ToolHandler {
  /** Nombre canónico de la tool que este handler atiende. */
  readonly name: ToolName;
  /**
   * Ejecuta la tool. `args` viene del modelo (NO confiable, validar). `ctx` lo
   * inyecta el executor (clinic_id/actor server-side). NUNCA debe lanzar para
   * errores esperables: devuelve `{ ok:false, ... }`. Si lanza, el executor lo
   * degrada a INTERNAL_ERROR genérico.
   */
  execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult>;
}

/**
 * Token de inyección: colección de todos los `ToolHandler` registrados. `AiModule`
 * lo arma a partir de los handlers exportados por los módulos de dominio.
 */
export const TOOL_HANDLERS = Symbol('TOOL_HANDLERS');
