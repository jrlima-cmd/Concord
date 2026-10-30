import { NextResponse } from "next/server";
import { COOKIE, tokenValido } from "@/lib/auth";

export async function proxy(request) {
  if (await tokenValido(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
