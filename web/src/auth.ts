/**
 * Authentication — three sign-in paths (BACKLOG F0.2, F3.1, F2.1):
 *   1. Local signup/login  (Credentials + bcrypt)
 *   2. Google SSO          (OIDC)
 *   3. SAML SSO            (via BoxyHQ Jackson — enterprise IdPs)
 *
 * Google and SAML are feature-flagged: absent config => the provider is not
 * registered and its button is hidden, so the app always boots.
 *
 * TRUST MODEL — important:
 * This is a public marketplace, so anyone may create an account (JIT provisioning
 * on SSO is intentional, unlike an internal tool). Sign-in grants nothing on its
 * own: every real action is gated on the user's ORGANIZATION being ops-verified
 * (see lib/rbac.ts). Logging in is not authorization.
 *
 * Sessions are JWT-backed and issued as HttpOnly + Secure cookies by Auth.js
 * (ARCHITECTURE.md §6.3) — tokens are never readable by client JS.
 */
import NextAuth, { type DefaultSession } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import BoxyHQSAML from 'next-auth/providers/boxyhq-saml';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { parseRole, parseOrgStatus, type Role, type OrgStatus } from '@/lib/rbac';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      orgId: string | null;
      orgStatus: OrgStatus | null;
    } & DefaultSession['user'];
  }
}

// NOTE: `next-auth/jwt` is only a re-export of `@auth/core/jwt`, so the
// augmentation must target the declaring module or TS reports TS2664.
declare module '@auth/core/jwt' {
  interface JWT {
    role?: Role;
    orgId?: string | null;
    orgStatus?: OrgStatus | null;
    disabled?: boolean;
  }
}

export const googleEnabled = (): boolean =>
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const samlEnabled = (): boolean =>
  !!process.env.BOXYHQ_SAML_ISSUER && !!process.env.BOXYHQ_SAML_CLIENT_ID;

function buildProviders(): Provider[] {
  const providers: Provider[] = [
    Credentials({
      id: 'credentials',
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : '';
        const password = typeof raw?.password === 'string' ? raw.password : '';
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Constant-ish time: still run a hash compare when the user is absent so a
        // missing account and a wrong password are not trivially distinguishable.
        const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
        const ok = await bcrypt.compare(password, hash);

        if (!user || !user.passwordHash || !ok) return null;
        if (!user.active || user.deletedAt) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ];

  if (googleEnabled()) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        allowDangerousEmailAccountLinking: true, // link Google to an existing local signup
      })
    );
  }

  if (samlEnabled()) {
    providers.push(
      BoxyHQSAML({
        issuer: process.env.BOXYHQ_SAML_ISSUER!,
        clientId: process.env.BOXYHQ_SAML_CLIENT_ID!,
        clientSecret: process.env.BOXYHQ_SAML_CLIENT_SECRET ?? 'dummy',
        allowDangerousEmailAccountLinking: true,
      })
    );
  }

  return providers;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials requires JWT sessions; the adapter still handles OAuth/SAML linking.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login', error: '/login' },
  providers: buildProviders(),
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (!token.sub) return token;

      // Re-read on every call so verification status and deactivation take effect
      // immediately rather than lingering until the 7-day token expires.
      const db = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          role: true,
          orgId: true,
          active: true,
          deletedAt: true,
          org: { select: { status: true } },
        },
      });

      if (!db || !db.active || db.deletedAt) {
        // The user is gone or disabled: kill the session outright rather than
        // keeping a flagged token. Returning null clears the cookie, so the user
        // lands cleanly signed-out instead of holding a zombie cookie that makes
        // the header say "Sign in" while they believe they are logged in.
        return null;
      }

      token.disabled = false;
      token.role = parseRole(db.role);
      token.orgId = db.orgId;
      token.orgStatus = parseOrgStatus(db.org?.status);
      return token;
    },

    async session({ session, token }) {
      if (token.disabled) {
        // Surface a session with no identity; middleware/guards treat this as signed out.
        return { ...session, user: { ...session.user, id: '', role: 'buyer', orgId: null, orgStatus: null } };
      }
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as Role) ?? 'buyer';
        session.user.orgId = (token.orgId as string | null) ?? null;
        session.user.orgStatus = (token.orgStatus as OrgStatus | null) ?? null;
      }
      return session;
    },
  },
});
