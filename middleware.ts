import { geolocation } from '@vercel/functions';
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { city, country } = geolocation(request);
  const response = NextResponse.next();
  response.headers.set('x-geo-city', city ?? '');
  response.headers.set('x-geo-country', country ?? '');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
