#!/usr/bin/env node
/**
 * Empuja las plantillas de correo de Supabase Auth (supabase/templates/*.html + los
 * asuntos de config.toml) al proyecto REMOTO vía Management API. Reemplaza el
 * "espejar a mano en el Dashboard" (auditoría 2026-09-14, H10; la deriva de #151).
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/supabase-auth-templates.mjs            # dry-run: qué cambiaría
 *   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/supabase-auth-templates.mjs --apply    # escribe
 *   … --project <ref>   (por defecto, el proyecto linkeado en supabase/.temp/project-ref)
 *
 * Token: https://supabase.com/dashboard/account/tokens (scope auth:write). Solo toca las
 * cuatro plantillas declaradas en config.toml; el resto de la config de Auth queda igual.
 * Cuando el Send Email Hook (#169) esté activo, estas plantillas dejan de usarse.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const projectArg = args[args.indexOf("--project") + 1];
const root = process.cwd();

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens).");
  process.exit(2);
}
const ref =
  (args.includes("--project") && projectArg) ||
  (existsSync(resolve(root, "supabase/.temp/project-ref")) && readFileSync(resolve(root, "supabase/.temp/project-ref"), "utf8").trim());
if (!ref) {
  console.error("Falta --project <ref> (o linkea el proyecto: npx supabase link).");
  process.exit(2);
}

/** [auth.email.template.X] subject + content_path desde config.toml (solo bloques activos). */
function templatesFromConfig(toml) {
  const out = {};
  const re = /^\[auth\.email\.template\.(\w+)\]\s*\n((?:(?!^\[)[^\n]*\n?)*)/gm;
  let m;
  while ((m = re.exec(toml))) {
    const [, name, body] = m;
    const subject = body.match(/^subject\s*=\s*"(.*)"\s*$/m)?.[1];
    const path = body.match(/^content_path\s*=\s*"(.*)"\s*$/m)?.[1];
    if (subject && path) out[name] = { subject, content: readFileSync(resolve(root, path), "utf8") };
  }
  return out;
}

const templates = templatesFromConfig(readFileSync(resolve(root, "supabase/config.toml"), "utf8"));
const names = Object.keys(templates);
if (names.length === 0) {
  console.error("config.toml no declara ninguna [auth.email.template.*] activa.");
  process.exit(2);
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const current = await fetch(api, { headers });
if (!current.ok) {
  console.error(`GET ${api} → ${current.status} ${await current.text()}`);
  process.exit(1);
}
const remote = await current.json();

const body = {};
const report = [];
for (const name of names) {
  const subjKey = `mailer_subjects_${name}`;
  const contKey = `mailer_templates_${name}_content`;
  const { subject, content } = templates[name];
  const subjDiff = (remote[subjKey] ?? "") !== subject;
  const contDiff = (remote[contKey] ?? "").trim() !== content.trim();
  if (subjDiff) body[subjKey] = subject;
  if (contDiff) body[contKey] = content;
  report.push(`${name.padEnd(14)} asunto: ${subjDiff ? "DIFIERE" : "igual"} · contenido: ${contDiff ? "DIFIERE" : "igual"}`);
}

console.log(`Proyecto ${ref} — plantillas de Auth vs. repo:`);
for (const line of report) console.log("  " + line);

if (Object.keys(body).length === 0) {
  console.log("Nada que empujar: el proyecto ya coincide con el repo.");
  process.exit(0);
}
if (!apply) {
  console.log(`\nDry-run. Se actualizarían ${Object.keys(body).length} campos: ${Object.keys(body).join(", ")}\nCorre con --apply para escribir.`);
  process.exit(0);
}

const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(body) });
if (!res.ok) {
  console.error(`PATCH → ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Listo: ${Object.keys(body).length} campos actualizados en ${ref}. Verifica con un inicio de sesión de prueba.`);
