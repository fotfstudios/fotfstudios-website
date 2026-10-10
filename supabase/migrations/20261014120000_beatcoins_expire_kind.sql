-- Beatcoins que vencen: nuevo tipo de movimiento 'expire' (siempre negativo).
-- Va sola porque un valor nuevo de enum no se puede usar en la misma transacción
-- que lo agrega; la migración siguiente (20261014120100) lo usa.
alter type points_entry_kind add value if not exists 'expire';
