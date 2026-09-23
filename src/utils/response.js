/**
 * Format response sesuai Dapodik
 * { results, id, start, limit, rows }
 */
function dapodikResponse(rows, opts = {}) {
  const idField = opts.idField || "id";
  const start = opts.start || 0;
  const limit = opts.limit || 20;
  const isArray = Array.isArray(rows);

  return {
    results: isArray ? rows.length : rows ? 1 : 0,
    id: idField,
    start,
    limit,
    rows: rows || (isArray ? [] : null),
  };
}

/**
 * Format error
 */
function errorResponse(message, errorCode, statusCode = 400, errors = null) {
  const res = {
    success: false,
    message,
    error_code: errorCode,
  };
  if (errors) res.errors = errors;
  return res;
}

/**
 * Format sukses (non-Dapodik)
 */
function successResponse(message, data = null) {
  const res = {
    success: true,
    message,
  };
  if (data) res.data = data;
  return res;
}

module.exports = { dapodikResponse, errorResponse, successResponse };