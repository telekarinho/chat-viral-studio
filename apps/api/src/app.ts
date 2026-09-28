import "reflect-metadata";
import {
  Body, CanActivate, Controller, ExecutionContext, Get, HttpException, HttpStatus, Inject, Injectable, Module, Post, Req, UseGuards,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { GenerateRequestSchema } from "@postai/domain";
import { generateContent, LlmUnavailableError, type LlmClient, type MemoryStore } from "./generation.service";

export interface AuthedUser { id: string; accessToken: string }

/** Everything that touches the outside world, injectable so tests can fake it. */
export interface ApiDeps {
  verifyToken(token: string): Promise<AuthedUser | null>;
  memoryFor(user: AuthedUser): MemoryStore;
  llm: LlmClient | null;
  rateLimit: { max: number; windowMs: number };
}

export const DEPS = Symbol("DEPS");

type AuthedRequest = { headers: Record<string, string | undefined>; user?: AuthedUser; correlationId?: string };

@Injectable()
class AuthGuard implements CanActivate {
  constructor(@Inject(DEPS) private readonly deps: ApiDeps) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!token) throw new HttpException({ code: "unauthorized" }, HttpStatus.UNAUTHORIZED);
    const user = await this.deps.verifyToken(token).catch(() => null);
    if (!user) throw new HttpException({ code: "unauthorized" }, HttpStatus.UNAUTHORIZED);
    req.user = user;
    return true;
  }
}

// ponytail: in-memory per-user limiter, move to Redis when the API runs on more than one instance
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: ApiDeps["rateLimit"], now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < limit.windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit.max;
}

@Controller()
class ContentController {
  constructor(@Inject(DEPS) private readonly deps: ApiDeps) {}

  @Get("health")
  health() {
    return { ok: true, llm: this.deps.llm ? this.deps.llm.model : null };
  }

  @Post("v1/content/generate")
  @UseGuards(AuthGuard)
  async generate(@Body() body: unknown, @Req() req: AuthedRequest) {
    const user = req.user!;
    const parsed = GenerateRequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpException({ code: "invalid_request", issues: parsed.error.issues.map((i) => i.path.join(".")) }, HttpStatus.BAD_REQUEST);
    if (!this.deps.llm) throw new HttpException({ code: "llm_not_configured" }, HttpStatus.SERVICE_UNAVAILABLE);
    if (rateLimited(user.id, this.deps.rateLimit)) throw new HttpException({ code: "rate_limited" }, HttpStatus.TOO_MANY_REQUESTS);
    const started = Date.now();
    try {
      const res = await generateContent(parsed.data, this.deps.llm, this.deps.memoryFor(user));
      log("info", "generate.ok", { user: user.id, ws: parsed.data.workspace_id, attempts: res.meta.attempts, ms: Date.now() - started });
      return res;
    } catch (e) {
      if (e instanceof LlmUnavailableError) {
        log("warn", "generate.llm_unavailable", { user: user.id, error: e.message });
        throw new HttpException({ code: "llm_unavailable" }, HttpStatus.BAD_GATEWAY);
      }
      const code = (e as { status?: number }).status;
      const status = code === 404 || code === 403 ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      log(status === 404 ? "warn" : "error", "generate.failed", { user: user.id, status, error: e instanceof Error ? e.message : String(e) });
      // 403 is reported as 404 so the API doesn't confirm which workspaces exist
      throw new HttpException({ code: status === 404 ? "workspace_not_found" : "internal_error" }, status);
    }
  }
}

function log(level: string, msg: string, data: Record<string, unknown>) {
  // structured logs; never includes prompts, tokens or user content
  process.stdout.write(JSON.stringify({ level, msg, ...data, at: new Date().toISOString() }) + "\n");
}

export async function createApp(deps: ApiDeps): Promise<INestApplication> {
  @Module({ controllers: [ContentController], providers: [{ provide: DEPS, useValue: deps }, AuthGuard] })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  app.enableShutdownHooks();
  return app;
}
