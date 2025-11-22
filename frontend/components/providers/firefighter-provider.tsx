'use client';

import { useEffect } from 'react';
import { initFirefighter } from '@/lib/firefighter-sdk';

interface FirefighterProviderProps {
  projectId?: string;
  children: React.ReactNode;
}

/**
 * Firefighter Provider
 * 
 * Automatically initializes the Firefighter SDK for error tracking.
 * 
 * Usage:
 * ```tsx
 * <FirefighterProvider projectId="your-project-id">
 *   {children}
 * </FirefighterProvider>
 * ```
 */
export function FirefighterProvider({ projectId, children }: FirefighterProviderProps) {
  useEffect(() => {
    if (!projectId) {
      console.warn('Firefighter SDK: projectId not provided. Error tracking disabled.');
      return;
    }

    initFirefighter({
      projectId,
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
      enabled: true,
    });
  }, [projectId]);

  return <>{children}</>;
}

