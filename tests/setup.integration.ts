// Carga .env.local (Supabase local + credenciales de prueba de MP) para los
// tests de integración. .env.local está gitignoreado.
import { config } from "dotenv";

config({ path: ".env.local" });
