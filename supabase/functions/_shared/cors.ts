/**
 * Secure CORS Configuration for Supabase Edge Functions
 *
 * Implements origin whitelisting to prevent unauthorized cross-origin requests.
 * Only requests from approved domains can access the Edge Functions.
 *
 * @module cors
 */

/**
 * Whitelist of allowed origins
 * Add your production and development domains here
 */
const ALLOWED_ORIGINS = [
  'http://localhost:5173',           // Vite dev server
  'http://localhost:3000',           // Alternative dev port
  'http://127.0.0.1:5173',          // Vite dev server (localhost alternative)
  'http://127.0.0.1:3000',          // Alternative dev port (localhost alternative)
  'https://jmhfaqlxketpqrxvuejv.supabase.co', // Supabase hosted UI
];

/**
 * Production domains - uncomment and add your production URL when deploying
 *
 * Examples:
 * - 'https://yourdomain.com'
 * - 'https://app.yourdomain.com'
 * - 'https://www.yourdomain.com'
 */
// const PRODUCTION_ORIGINS = [
//   'https://yourdomain.com',
// ];

/**
 * Get CORS headers for the requesting origin
 *
 * @param request - The incoming HTTP request
 * @returns CORS headers with origin validation
 *
 * @example
 * ```typescript
 * serve(async (req) => {
 *   const corsHeaders = getCorsHeaders(req);
 *
 *   if (req.method === 'OPTIONS') {
 *     return new Response(null, { headers: corsHeaders });
 *   }
 *
 *   // ... your function logic
 *
 *   return new Response(JSON.stringify(data), {
 *     headers: { ...corsHeaders, 'Content-Type': 'application/json' }
 *   });
 * });
 * ```
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';

  // Combine all allowed origins
  const allAllowedOrigins = [
    ...ALLOWED_ORIGINS,
    // Uncomment when you have production domains:
    // ...PRODUCTION_ORIGINS,
  ];

  // Check if the origin is in the whitelist
  const isAllowed = allAllowedOrigins.includes(origin);

  // Log rejected origins for security monitoring
  if (origin && !isAllowed) {
    console.warn(`⚠️ Rejected request from unauthorized origin: ${origin}`);
  }

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allAllowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

/**
 * Create a CORS preflight response
 *
 * @param request - The incoming OPTIONS request
 * @returns Response with CORS headers
 *
 * @example
 * ```typescript
 * serve(async (req) => {
 *   if (req.method === 'OPTIONS') {
 *     return handleCorsPreflightRequest(req);
 *   }
 *   // ... rest of function
 * });
 * ```
 */
export function handleCorsPreflightRequest(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * Validate that the request comes from an allowed origin
 *
 * @param request - The incoming request
 * @returns True if the origin is allowed, false otherwise
 *
 * @example
 * ```typescript
 * serve(async (req) => {
 *   if (!isOriginAllowed(req)) {
 *     return new Response('Forbidden', { status: 403 });
 *   }
 *   // ... process request
 * });
 * ```
 */
export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin') || '';

  if (!origin) {
    // Allow requests without an origin header (like from server-side or Postman)
    return true;
  }

  const allAllowedOrigins = [
    ...ALLOWED_ORIGINS,
    // Uncomment when you have production domains:
    // ...PRODUCTION_ORIGINS,
  ];

  return allAllowedOrigins.includes(origin);
}

/**
 * Create an error response with CORS headers
 *
 * @param request - The incoming request
 * @param error - The error message
 * @param status - HTTP status code (default: 500)
 * @returns Response with error and CORS headers
 *
 * @example
 * ```typescript
 * try {
 *   // ... your function logic
 * } catch (error) {
 *   return createCorsErrorResponse(req, error.message, 400);
 * }
 * ```
 */
export function createCorsErrorResponse(
  request: Request,
  error: string,
  status: number = 500
): Response {
  return new Response(
    JSON.stringify({ error, success: false }),
    {
      status,
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Create a success response with CORS headers
 *
 * @param request - The incoming request
 * @param data - The response data
 * @param status - HTTP status code (default: 200)
 * @returns Response with data and CORS headers
 *
 * @example
 * ```typescript
 * return createCorsSuccessResponse(req, { message: 'Success', data: result });
 * ```
 */
export function createCorsSuccessResponse(
  request: Request,
  data: any,
  status: number = 200
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'application/json',
      },
    }
  );
}
