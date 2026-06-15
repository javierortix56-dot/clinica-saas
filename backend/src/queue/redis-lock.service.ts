import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

/**
 * Mutex distribuido por clave en Redis (blueprint Paso 6 §3 — pieza central A4).
 *
 * Serializa el procesamiento por conversación sin frenar otras: cada job intenta
 * adquirir `lock:wa:<phone>:<contact>`; quien lo tiene procesa, el resto se
 * reencola diferido. El TTL es la red de seguridad ante un worker muerto (el lock
 * expira solo); el heartbeat lo renueva mientras el turno está vivo para que un
 * turno legítimamente lento no lo pierda a mitad de camino.
 *
 * Liberar/renovar usan check-and-act por token (Lua) para no tocar el lock de otro.
 */
@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly redis: Redis;

  // Libera solo si el token coincide (no borra el lock de otro dueño).
  private static readonly RELEASE_LUA =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  // Renueva el TTL solo si el token coincide (heartbeat).
  private static readonly EXTEND_LUA =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

  constructor(config: ConfigService) {
    this.redis = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
  }

  /** Intenta tomar el lock. Devuelve true si lo adquirió. */
  async acquire(key: string, token: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  /** Renueva el TTL si seguimos siendo dueños (heartbeat). */
  async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const res = (await this.redis.eval(
      RedisLockService.EXTEND_LUA,
      1,
      key,
      token,
      String(ttlMs),
    )) as number;
    return res === 1;
  }

  /** Libera el lock si seguimos siendo dueños. */
  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RedisLockService.RELEASE_LUA, 1, key, token);
  }

  /**
   * Inicia un heartbeat que renueva el lock cada `ttlMs/3`. Devuelve una función
   * para detenerlo (llamar en el `finally`, junto con `release`).
   */
  startHeartbeat(key: string, token: string, ttlMs: number): () => void {
    const interval = setInterval(() => {
      this.extend(key, token, ttlMs).catch((err) =>
        this.logger.warn(`Heartbeat del lock ${key} falló: ${err}`),
      );
    }, Math.max(1000, Math.floor(ttlMs / 3)));
    // No mantener vivo el proceso por este timer.
    interval.unref?.();
    return () => clearInterval(interval);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
