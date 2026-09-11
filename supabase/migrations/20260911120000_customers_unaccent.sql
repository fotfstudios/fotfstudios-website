-- Búsqueda del directorio insensible a acentos.
--
-- Problema: `ilike` compara byte a byte, así que buscar "pia" NO encuentra a
-- "Pía". Para un estudio chileno eso es el caso común, no el borde: Matías,
-- Nicolás, Sebastián, Pía. Un cliente SIN email y con tilde quedaba
-- prácticamente invisible en el picker, y un cliente invisible se duplica.
--
-- Se resuelve con una columna GENERADA normalizada (minúsculas y sin
-- diacríticos) contra la que busca el adaptador, con su espejo en JS
-- (`stripAccents`) aplicándole lo mismo al término tipeado.

create extension if not exists unaccent with schema extensions;

-- `unaccent(text)` de un solo argumento es STABLE, no IMMUTABLE: resuelve el
-- diccionario por `search_path`, que puede cambiar entre sesiones. Postgres
-- entonces la rechaza dentro de una columna generada. La forma de DOS
-- argumentos fija el diccionario explícitamente, y por eso este envoltorio SÍ
-- puede declararse immutable sin mentir.
create or replace function public.immutable_unaccent(p_text text)
returns text language sql immutable strict parallel safe as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text)
$$;

alter table customers
  add column name_norm text
  generated always as (public.immutable_unaccent(lower(coalesce(name, '')))) stored;

-- El directorio es chico (decenas de filas) y la búsqueda es `%texto%`, que un
-- btree no puede usar igual. El índice existe para el prefijo y para no quedar
-- sin nada si el directorio crece; pg_trgm sería el paso siguiente y se deja
-- fuera a propósito (no-goal del spec).
create index customers_name_norm_idx on customers (name_norm);

comment on column customers.name_norm is
  'Nombre en minúsculas y sin diacríticos. Solo para buscar; el nombre que se muestra es `name`.';
