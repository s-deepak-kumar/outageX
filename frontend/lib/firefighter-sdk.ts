/**
 * DevOps Firefighter Client SDK
 * 
 * Automatically reports runtime errors to the backend for incident detection.
 * 
 * Usage:
 * ```ts
 * import { initFirefighter } from '@/lib/firefighter-sdk';
 * 
 * initFirefighter({
 *   projectId: 'your-project-id',
 *   backendUrl: 'http://localhost:3001',
 * });
 * ```
 */

interface FirefighterConfig {
  projectId: string;
  backendUrl?: string;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

class FirefighterSDK {
  private config: FirefighterConfig | null = null;
  private initialized = false;

  /**
   * Initialize the SDK
   */
  init(config: FirefighterConfig): void {
    if (this.initialized) {
      console.warn('Firefighter SDK already initialized');
      return;
    }

    this.config = {
      backendUrl: config.backendUrl || 'http://localhost:3001',
      enabled: config.enabled !== false,
      ...config,
    };

    if (!this.config.enabled) {
      console.log('Firefighter SDK disabled');
      return;
    }

    // Set up global error handlers
    this.setupErrorHandlers();

    this.initialized = true;
    console.log('🔥 Firefighter SDK initialized for project:', this.config.projectId);
  }

  /**
   * Set up global error handlers
   */
  private setupErrorHandlers(): void {
    if (typeof window === 'undefined') {
      // Server-side (Next.js)
      this.setupServerErrorHandlers();
    } else {
      // Client-side (Browser)
      this.setupClientErrorHandlers();
    }
  }

  /**
   * Set up client-side error handlers
   */
  private setupClientErrorHandlers(): void {
    // Unhandled errors
    window.addEventListener('error', (event) => {
      this.reportError({
        message: event.message,
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        url: window.location.href,
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        url: window.location.href,
      });
    });

    // Console errors (optional - can be noisy)
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      
      // Only report if it looks like an error
      const errorMessage = args.join(' ');
      if (errorMessage.toLowerCase().includes('error') || 
          errorMessage.toLowerCase().includes('failed') ||
          errorMessage.toLowerCase().includes('exception')) {
        this.reportError({
          message: errorMessage,
          url: window.location.href,
        });
      }
    };
  }

  /**
   * Set up server-side error handlers (Next.js)
   */
  private setupServerErrorHandlers(): void {
    // For Next.js, errors are typically caught in error boundaries
    // This is mainly for API routes
    process.on('uncaughtException', (error) => {
      this.reportError({
        message: error.message,
        stack: error.stack,
      });
    });

    process.on('unhandledRejection', (reason: any) => {
      this.reportError({
        message: reason?.message || String(reason),
        stack: reason?.stack,
      });
    });
  }

  /**
   * Report an error to the backend
   */
  async reportError(error: {
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    url?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.config || !this.config.enabled) {
      return;
    }

    try {
      const response = await fetch(`${this.config.backendUrl}/api/webhooks/error-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: this.config.projectId,
          error: {
            message: error.message,
            stack: error.stack,
            url: error.url || (typeof window !== 'undefined' ? window.location.href : undefined),
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno,
          },
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            timestamp: new Date().toISOString(),
            ...error.metadata,
          },
        }),
      });

      if (!response.ok) {
        console.warn('Failed to report error to Firefighter:', response.statusText);
      }
    } catch (err) {
      // Silently fail - don't break the app
      console.warn('Error reporting to Firefighter:', err);
    }

    // Call custom error handler if provided
    if (this.config.onError) {
      this.config.onError(new Error(error.message));
    }
  }

  /**
   * Manually report an error
   */
  async captureError(error: Error, metadata?: Record<string, any>): Promise<void> {
    await this.reportError({
      message: error.message,
      stack: error.stack,
      metadata,
    });
  }
}

// Export singleton instance
const firefighterSDK = new FirefighterSDK();

/**
 * Initialize Firefighter SDK
 */
export function initFirefighter(config: FirefighterConfig): void {
  firefighterSDK.init(config);
}

/**
 * Manually capture an error
 */
export async function captureError(error: Error, metadata?: Record<string, any>): Promise<void> {
  await firefighterSDK.captureError(error, metadata);
}

export default firefighterSDK;

