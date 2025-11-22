/**
 * OutageX DevOps Firefighter Client SDK
 * 
 * Automatically reports runtime errors to the backend for incident detection and automatic resolution.
 * Supports source map parsing for accurate error location in production builds.
 * 
 * Installation:
 * npm install source-map-js
 * 
 * Usage:
 * ```ts
 * import { initOutageX } from './outagex-sdk';
 * 
 * initOutageX({
 *   projectId: 'your-project-id',
 *   backendUrl: 'https://your-backend.com',
 * });
 * ```
 * 
 * Next.js Configuration:
 * Add to next.config.js:
 * ```js
 * module.exports = {
 *   productionBrowserSourceMaps: true, // Required for OutageX
 * }
 * ```
 */

import { SourceMapConsumer } from 'source-map-js';

interface OutageXConfig {
  projectId: string;
  backendUrl: string;
  enabled?: boolean;
  enableSourceMaps?: boolean;
  onError?: (error: Error) => void;
}

interface ParsedStackFrame {
  functionName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  source?: string;
  originalFileName?: string;
  originalLine?: number;
  originalColumn?: number;
}

interface SourceMapCache {
  [url: string]: SourceMapConsumer | null;
}

class OutageXSDK {
  private config: OutageXConfig | null = null;
  private initialized = false;
  private sourceMapCache: SourceMapCache = {};
  private sourceMapPromises: { [url: string]: Promise<SourceMapConsumer | null> } = {};

  /**
   * Initialize the SDK
   */
  init(config: OutageXConfig): void {
    if (this.initialized) {
      console.warn('[OutageX SDK] Already initialized');
      return;
    }

    if (!config.projectId || !config.backendUrl) {
      console.error('[OutageX SDK] projectId and backendUrl are required');
      return;
    }

    this.config = {
      enabled: config.enabled !== false,
      enableSourceMaps: config.enableSourceMaps !== false,
      ...config,
    };

    if (!this.config.enabled) {
      console.log('[OutageX SDK] Disabled');
      return;
    }

    this.setupErrorHandlers();
    this.initialized = true;
    console.log('🔥 OutageX SDK initialized for project:', this.config.projectId);
  }

  /**
   * Parse a single line of stack trace
   */
  private parseStackLine(line: string): ParsedStackFrame | null {
    // Chrome/Edge format: "    at functionName (file.js:10:5)"
    // Also handles: "at https://domain.com/file.js:10:5"
    let match = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (match) {
      let fileName = match[2];
      
      // Remove query params from fileName
      fileName = fileName.split('?')[0].split('#')[0];
      
      return {
        functionName: match[1]?.trim() || '<anonymous>',
        fileName: fileName,
        lineNumber: parseInt(match[3], 10),
        columnNumber: parseInt(match[4], 10),
        source: line.trim(),
      };
    }

    // Firefox format: "functionName@file.js:10:5"
    match = line.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
    if (match) {
      let fileName = match[2].split('?')[0].split('#')[0];
      return {
        functionName: match[1] || '<anonymous>',
        fileName: fileName,
        lineNumber: parseInt(match[3], 10),
        columnNumber: parseInt(match[4], 10),
        source: line.trim(),
      };
    }

    // Safari/alternate format: "file.js:10:5"
    match = line.match(/^(?:(.+?)@)?(.+?):(\d+):(\d+)$/);
    if (match) {
      let fileName = match[2].split('?')[0].split('#')[0];
      return {
        functionName: match[1] || '<anonymous>',
        fileName: fileName,
        lineNumber: parseInt(match[3], 10),
        columnNumber: parseInt(match[4], 10),
        source: line.trim(),
      };
    }

    return null;
  }

  /**
   * Normalize URL for consistent caching and source map fetching
   */
  private normalizeUrl(url: string): string {
    // Remove query params and fragments
    let normalized = url.split('?')[0].split('#')[0];
    
    // Convert relative URLs to absolute if needed
    if (normalized.startsWith('/') && typeof window !== 'undefined') {
      normalized = `${window.location.origin}${normalized}`;
    }
    
    return normalized;
  }

  /**
   * Fetch and parse a source map
   */
  private async fetchSourceMap(url: string): Promise<SourceMapConsumer | null> {
    const normalizedUrl = this.normalizeUrl(url);

    // Check cache first
    if (normalizedUrl in this.sourceMapCache) {
      return this.sourceMapCache[normalizedUrl];
    }

    // Check if already fetching
    if (normalizedUrl in this.sourceMapPromises) {
      return this.sourceMapPromises[normalizedUrl];
    }

    // Start fetching
    const promise = (async () => {
      try {
        // Try to fetch the .map file
        const mapUrl = normalizedUrl.endsWith('.map') ? normalizedUrl : `${normalizedUrl}.map`;
        
        console.log(`[OutageX SDK] 🔍 Fetching source map from: ${mapUrl}`);
        
        const response = await fetch(mapUrl, {
          method: 'GET',
          // Important: don't send credentials for source maps
          credentials: 'omit',
        });
        
        if (!response.ok) {
          console.warn(`[OutageX SDK] ❌ Source map fetch failed (${response.status}): ${mapUrl}`);
          this.sourceMapCache[normalizedUrl] = null;
          return null;
        }

        console.log(`[OutageX SDK] ✅ Source map response received, parsing...`);
        
        const sourceMapData = await response.json();
        
        console.log(`[OutageX SDK] 📦 Source map data:`, {
          version: sourceMapData.version,
          sources: sourceMapData.sources?.length || 0,
          hasMappings: !!sourceMapData.mappings,
        });
        
        const consumer = await new SourceMapConsumer(sourceMapData);
        
        this.sourceMapCache[normalizedUrl] = consumer;
        console.log(`[OutageX SDK] ✅ Source map parsed successfully for: ${mapUrl}`);
        
        return consumer;
      } catch (error) {
        console.error(`[OutageX SDK] ❌ Error loading source map for ${normalizedUrl}:`, error);
        this.sourceMapCache[normalizedUrl] = null;
        return null;
      } finally {
        delete this.sourceMapPromises[normalizedUrl];
      }
    })();

    this.sourceMapPromises[normalizedUrl] = promise;
    return promise;
  }

  /**
   * Resolve original position using source map
   */
  private async resolveOriginalPosition(
    fileName: string,
    line: number,
    column: number
  ): Promise<{
    source?: string;
    line?: number;
    column?: number;
    name?: string;
  } | null> {
    try {
      const consumer = await this.fetchSourceMap(fileName);
      
      if (!consumer) {
        return null;
      }

      const original = consumer.originalPositionFor({
        line,
        column,
      });

      // Check if we got valid results
      if (!original.source || original.line === null) {
        return null;
      }

      // Clean up the source path
      let cleanSource = original.source
        .replace(/^webpack:\/\/\//, '')
        .replace(/^webpack:\/\//, '')
        .replace(/^\.\//, '')
        .replace(/^\//, '');

      return {
        source: cleanSource,
        line: original.line,
        column: original.column ?? undefined,
        name: original.name ?? undefined,
      };
    } catch (error) {
      console.warn(`[OutageX SDK] Error resolving source map position:`, error);
      return null;
    }
  }

  /**
   * Parse stack trace with source map support
   */
  private async parseStackTraceWithSourceMaps(stack: string): Promise<ParsedStackFrame[]> {
    const lines = stack.split('\n');
    const frames: ParsedStackFrame[] = [];

    for (const line of lines) {
      const frame = this.parseStackLine(line);
      if (!frame || !frame.fileName) continue;

      // Skip internal/node_modules files
      if (
        frame.fileName.includes('node_modules') ||
        frame.fileName.includes('webpack/runtime') ||
        frame.fileName.includes('next/dist') ||
        frame.fileName.includes('webpack-internal')
      ) {
        continue;
      }

      // Try to resolve with source map if enabled
      if (
        this.config?.enableSourceMaps &&
        frame.lineNumber !== undefined &&
        frame.columnNumber !== undefined
      ) {
        const original = await this.resolveOriginalPosition(
          frame.fileName,
          frame.lineNumber,
          frame.columnNumber
        );

        if (original && original.source) {
          frames.push({
            functionName: original.name || frame.functionName,
            fileName: original.source,
            lineNumber: original.line,
            columnNumber: original.column,
            source: frame.source,
            // Keep original for reference
            originalFileName: frame.fileName,
            originalLine: frame.lineNumber,
            originalColumn: frame.columnNumber,
          });
          continue;
        }
      }

      // Fallback: clean the path but don't resolve
      let cleanPath = frame.fileName
        .replace(/^webpack:\/\/|^file:\/\/|^https?:\/\/[^/]+\//, '')
        .replace(/^\.\//, '')
        .replace(/^\/+/, '');

      // Basic Next.js path cleaning
      if (cleanPath.includes('_next/static/chunks/app/')) {
        const match = cleanPath.match(/_next\/static\/chunks\/app\/(.+?)(?:-[a-f0-9]+)?\.(js|jsx)$/);
        if (match) {
          cleanPath = `app/${match[1]}.tsx`;
        }
      } else if (cleanPath.includes('_next/static/chunks/pages/')) {
        const match = cleanPath.match(/_next\/static\/chunks\/pages\/(.+?)(?:-[a-f0-9]+)?\.(js|jsx)$/);
        if (match) {
          cleanPath = `pages/${match[1]}.tsx`;
        }
      }

      frames.push({
        ...frame,
        fileName: cleanPath,
      });
    }

    return frames;
  }

  /**
   * Extract best source file from parsed frames
   */
  private extractBestSourceFile(frames: ParsedStackFrame[]): {
    filePath?: string;
    lineNumber?: number;
    columnNumber?: number;
    functionName?: string;
  } {
    // Find the first frame that looks like user code
    for (const frame of frames) {
      if (
        frame.fileName &&
        frame.fileName.match(/\.(tsx?|jsx?)$/) &&
        frame.lineNumber &&
        frame.lineNumber > 0
      ) {
        return {
          filePath: frame.fileName,
          lineNumber: frame.lineNumber,
          columnNumber: frame.columnNumber,
          functionName: frame.functionName,
        };
      }
    }

    return {};
  }

  /**
   * Set up global error handlers
   */
  private setupErrorHandlers(): void {
    if (typeof window === 'undefined') {
      this.setupServerErrorHandlers();
    } else {
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

    console.log('[OutageX SDK] ✅ Client error handlers registered');
  }

  /**
   * Set up server-side error handlers
   */
  private setupServerErrorHandlers(): void {
    // @ts-ignore - Node.js globals
    if (typeof process !== 'undefined' && process.on) {
      // @ts-ignore
      process.on('uncaughtException', (error: Error) => {
        this.reportError({
          message: error.message,
          stack: error.stack,
        });
      });

      // @ts-ignore
      process.on('unhandledRejection', (reason: any) => {
        this.reportError({
          message: reason?.message || String(reason),
          stack: reason?.stack,
        });
      });

      console.log('[OutageX SDK] ✅ Server error handlers registered');
    }
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
      let sourceInfo: any = {};
      let parsedFrames: ParsedStackFrame[] = [];

      if (error.stack) {
        console.log('[OutageX SDK] 🔍 Parsing stack trace...');
        parsedFrames = await this.parseStackTraceWithSourceMaps(error.stack);
        sourceInfo = this.extractBestSourceFile(parsedFrames);
        
        console.log(`[OutageX SDK] 📊 Parsed ${parsedFrames.length} stack frame(s)`);
      }

      // Log what we're reporting
      if (sourceInfo.filePath) {
        console.log(`[OutageX SDK] 📄 Reporting error:`, {
          file: sourceInfo.filePath,
          line: sourceInfo.lineNumber,
          column: sourceInfo.columnNumber,
          function: sourceInfo.functionName,
          message: error.message.substring(0, 100),
        });
      } else {
        console.warn(`[OutageX SDK] ⚠️ Could not extract source location`, {
          hasStack: !!error.stack,
          hasFilename: !!error.filename,
          message: error.message.substring(0, 100),
        });
      }

      // Send to backend
      const payload = {
        projectId: this.config.projectId,
        error: {
          message: error.message,
          stack: error.stack,
          url: error.url || (typeof window !== 'undefined' ? window.location.href : undefined),
          filename: sourceInfo.filePath || error.filename,
          lineno: sourceInfo.lineNumber || error.lineno,
          colno: sourceInfo.columnNumber || error.colno,
          functionName: sourceInfo.functionName,
          stackFrames: parsedFrames, // Send all frames for backend analysis
        },
        metadata: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          timestamp: new Date().toISOString(),
          sourceMapEnabled: this.config.enableSourceMaps,
          sdkVersion: '1.0.0',
          ...error.metadata,
        },
      };

      const response = await fetch(`${this.config.backendUrl}/api/webhooks/error-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`[OutageX SDK] ❌ Failed to report error (${response.status}):`, response.statusText);
      } else {
        console.log('[OutageX SDK] ✅ Error reported successfully');
      }
    } catch (err) {
      console.warn('[OutageX SDK] ❌ Error reporting failed:', err);
    }

    // Call custom error handler if provided
    if (this.config.onError) {
      try {
        this.config.onError(new Error(error.message));
      } catch (handlerError) {
        console.warn('[OutageX SDK] Custom error handler threw:', handlerError);
      }
    }
  }

  /**
   * Manually capture an error
   */
  async captureError(error: Error, metadata?: Record<string, any>): Promise<void> {
    await this.reportError({
      message: error.message,
      stack: error.stack,
      metadata,
    });
  }

  /**
   * Cleanup - destroy source map consumers
   */
  destroy(): void {
    Object.values(this.sourceMapCache).forEach((consumer) => {
      if (consumer && typeof (consumer as any).destroy === 'function') {
        (consumer as any).destroy();
      }
    });
    this.sourceMapCache = {};
    this.sourceMapPromises = {};
    this.initialized = false;
    console.log('[OutageX SDK] Destroyed');
  }
}

// Export singleton instance
const outageXSDK = new OutageXSDK();

/**
 * Initialize OutageX SDK
 */
export function initOutageX(config: OutageXConfig): void {
  outageXSDK.init(config);
}

/**
 * Manually capture an error
 */
export async function captureError(error: Error, metadata?: Record<string, any>): Promise<void> {
  await outageXSDK.captureError(error, metadata);
}

/**
 * Cleanup SDK resources
 */
export function destroyOutageX(): void {
  outageXSDK.destroy();
}

export default outageXSDK;