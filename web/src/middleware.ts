import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.SITE_USER || 'admin';
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const d = atob(auth.slice(6));
      const i = d.indexOf(':');
      if (d.slice(0, i) === user && d.slice(i + 1) === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse('Acesso restrito.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Chat Viral Studio", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)'],
};
