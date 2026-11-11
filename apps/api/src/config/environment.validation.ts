import { z } from "zod";

const environmentSchema = z.object({
  HOST: z.string().ip().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  // Días sin uso hasta que vence la sesión (SISTEMA-93). Nunca menos de 3
  // (72 h): sobra margen sobre las 24 h sin internet más un fin de semana.
  SESSION_INACTIVITY_DAYS: z.coerce
    .number()
    .min(3, "SESSION_INACTIVITY_DAYS no puede ser menor a 3 días (72 h).")
    .max(400)
    .default(7),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  return environmentSchema.parse(config);
}
