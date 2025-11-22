/**
 * Demo User for POC
 * 
 * Replaces NextAuth authentication with a hardcoded demo user
 */

export const DEMO_USER = {
  id: 'demo-user',
  name: 'S Deepak Kumar',
  email: 'dipkfilms@gmail.com',
  plan: 'enterprise' as const,
};

/**
 * Get demo user (replaces auth() call)
 */
export async function getDemoUser() {
  return {
    user: DEMO_USER,
  };
}

/**
 * Check if user is authenticated (always true for POC)
 */
export async function isAuthenticated() {
  return true;
}

export type DemoSession = {
  user: typeof DEMO_USER;
};

