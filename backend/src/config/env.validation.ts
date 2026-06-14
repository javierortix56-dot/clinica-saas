import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
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

  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY!: string;

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

  // --- Infra ---
  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;
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
