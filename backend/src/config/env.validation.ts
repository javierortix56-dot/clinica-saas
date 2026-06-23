import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum LlmProvider {
  Gemini = 'gemini',
  Anthropic = 'anthropic',
  Openai = 'openai',
}

/**
 * Contrato tipado de las variables de entorno del backend (ver blueprint §
 * "Variables de entorno"). Se valida al arranque; si falta o es inválida una
 * variable requerida, la app no levanta.
 */
export class EnvironmentVariables {
  // --- Postgres / Supabase ---
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DIRECT_URL!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_URL!: string;

  // Opcional por ahora: las escrituras del bot usan Prisma con DATABASE_URL.
  // Requerido sólo si se usa el cliente supabase-js con service_role.
  @IsOptional()
  @IsString()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // --- WhatsApp Cloud API ---
  @IsString()
  @IsNotEmpty()
  WHATSAPP_PHONE_NUMBER_ID!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_BUSINESS_ACCOUNT_ID!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_ACCESS_TOKEN!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_VERIFY_TOKEN!: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_APP_SECRET!: string;

  // --- LLM ---
  @IsEnum(LlmProvider)
  LLM_PROVIDER: LlmProvider = LlmProvider.Gemini;

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY!: string;

  // Modelo de Gemini. Opcional; GeminiLlmClient usa 'gemini-2.5-flash' si falta.
  @IsOptional()
  @IsString()
  GEMINI_MODEL?: string;

  // Colchón de adyacencia para proponer_turnos (minutos). Opcional; default 5.
  @IsOptional()
  @IsString()
  SCHEDULING_ADJACENCY_BUFFER_MIN?: string;

  // --- Infra ---
  // Requerido desde el Paso 6: la cola BullMQ y el mutex por conversación usan Redis.
  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  // Actor del bot para auditoría (runAsBot). UUID fijo que representa al bot.
  @IsString()
  @IsNotEmpty()
  BOT_ACTOR_ID!: string;

  // Concurrencia global del worker de WhatsApp. Opcional; default 5.
  @IsOptional()
  @IsString()
  QUEUE_CONCURRENCY?: string;

  // TTL del mutex por conversación (ms). Opcional; default 120000 (se renueva por heartbeat).
  @IsOptional()
  @IsString()
  QUEUE_LOCK_TTL_MS?: string;

  // Delay de reencolado al perder el lock por contención (ms). Opcional; default 1000.
  @IsOptional()
  @IsString()
  QUEUE_CONTENTION_DELAY_MS?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  // Diagnóstico: 'true' fuerza a Prisma a conectarse por DIRECT_URL (ver
  // PrismaService). Opcional; ausente/'false' => operación normal por el pooler.
  @IsOptional()
  @IsString()
  PRISMA_USE_DIRECT_URL?: string;

  // --- Google Calendar ---
  // Credenciales OAuth de la Google Cloud Console (tipo "Web application").
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  // URL de callback configurada en Google Cloud Console.
  // Ejemplo: https://clinica-backend-production-4779.up.railway.app/auth/google/callback
  @IsOptional()
  @IsString()
  GOOGLE_REDIRECT_URI?: string;

  // URL del frontend para redirigir tras el callback OAuth.
  // Ejemplo: https://clinica.vercel.app
  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  // URL pública del webhook de notificaciones push de Google Calendar. Opcional:
  // si no se setea, se deriva del origin de GOOGLE_REDIRECT_URI.
  // Ejemplo: https://clinica-backend-production-4779.up.railway.app/google-calendar/webhook
  @IsOptional()
  @IsString()
  GOOGLE_WEBHOOK_URL?: string;

  // Nombre del archivo de verificación de dominio de Google (Search Console,
  // método "HTML file"). Ejemplo: google1a2b3c4d5e6f.html
  @IsOptional()
  @IsString()
  GOOGLE_SITE_VERIFICATION?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Validación de variables de entorno fallida:\n${errors.toString()}`,
    );
  }

  return validatedConfig;
}
