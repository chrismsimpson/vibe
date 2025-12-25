import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({
  quiet: true,
});

const envSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

const env = envSchema.parse(process.env);

export { env };
