import { auth } from '@/lib/auth';
import { polarClient } from '@/lib/polar';
import { initTRPC, TRPCError } from '@trpc/server';
import { headers } from 'next/headers';
import { cache } from 'react';

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return { userId: 'user_123' };
});

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
  }

  return next({
    ctx: {
      ...ctx,
      auth: session,
    },
  });
});

// Cache the Polar customer state lookup per user for the lifetime of the
// current React request so that multiple premiumProcedure calls in the same
// request batch do not each fire a separate network round-trip.
const getCustomerState = cache(async (userId: string) => {
  return polarClient.customers.getStateExternal({ externalId: userId });
});

export const premiumProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const customer = await getCustomerState(ctx.auth.user.id);

  if (
    !customer.activeSubscriptions ||
    customer.activeSubscriptions.length === 0 
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "Active subscription required",
    });
  }
  return next({ ctx: { ...ctx, customer } });
});