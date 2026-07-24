/** Rate limiter por clave. `hit` cuenta un intento y dice si sigue dentro del límite. */
export interface RateLimiter {
  /** true = permitido (dentro del límite); false = excedido. La clave debe venir hasheada. */
  hit(key: string, max: number, windowSeconds: number): Promise<boolean>;
}
