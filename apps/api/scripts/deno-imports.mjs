// Rewrites bare npm imports of an edge bundle to Deno `npm:` specifiers (default: the `generate` function).
import { readFileSync, writeFileSync } from "node:fs";
const fn = process.argv[2] ?? "generate";
const f = new URL(`../../../supabase/functions/${fn}/index.ts`, import.meta.url);
const src = readFileSync(f, "utf8")
  .replace(/from ["']@supabase\/supabase-js["']/g, 'from "npm:@supabase/supabase-js@2"')
  .replace(/from ["']zod["']/g, 'from "npm:zod@4"');
writeFileSync(f, src);
