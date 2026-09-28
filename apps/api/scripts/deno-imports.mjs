// Rewrites bare npm imports of the edge bundle to Deno `npm:` specifiers.
import { readFileSync, writeFileSync } from "node:fs";
const f = new URL("../../../supabase/functions/generate/index.ts", import.meta.url);
const src = readFileSync(f, "utf8")
  .replace(/from ["']@supabase\/supabase-js["']/g, 'from "npm:@supabase/supabase-js@2"')
  .replace(/from ["']zod["']/g, 'from "npm:zod@4"');
writeFileSync(f, src);
