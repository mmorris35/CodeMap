/**
 * JSON-RPC 2.0 Error codes
 * @see https://www.jsonrpc.org/specification#error_object
 */

/**
 * Parse error - Invalid JSON was received by the server
 * @remarks The error code is defined by the JSON-RPC 2.0 specification
 */
export const PARSE_ERROR_CODE = -32700;

/**
 * Invalid Request - The JSON sent is not a valid Request object
 */
export const INVALID_REQUEST_CODE = -32600;

/**
 * Method not found - The method does not exist / is not available
 */
export const METHOD_NOT_FOUND_CODE = -32601;

/**
 * Invalid params - Invalid method parameter(s)
 */
export const INVALID_PARAMS_CODE = -32602;

/**
 * Internal error - Internal JSON-RPC error
 */
export const INTERNAL_ERROR_CODE = -32603;

/**
 * Server error range start (reserved for implementation-defined errors)
 */
export const SERVER_ERROR_MIN = -32768;

/**
 * Server error range end
 */
export const SERVER_ERROR_MAX = -32000;

/**
 * Helper function to create a JSON-RPC error object
 */
export function createError(code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0' as const,
    error: { code, message, data },
  };
}

/**
 * Helper function to create a parse error response
 */
export function createParseError(data?: unknown) {
  return createError(PARSE_ERROR_CODE, 'Parse error', data);
}

/**
 * Helper function to create an invalid request response
 */
export function createInvalidRequest(data?: unknown) {
  return createError(INVALID_REQUEST_CODE, 'Invalid request', data);
}

/**
 * Helper function to create a method not found response
 */
export function createMethodNotFound(method: string) {
  return createError(METHOD_NOT_FOUND_CODE, `Method not found: ${method}`);
}

/**
 * Helper function to create an invalid params response
 */
export function createInvalidParams(message: string) {
  return createError(INVALID_PARAMS_CODE, `Invalid params: ${message}`);
}

/**
 * Helper function to create an internal error response
 */
export function createInternalError(message: string) {
  return createError(INTERNAL_ERROR_CODE, `Internal error: ${message}`);
}
