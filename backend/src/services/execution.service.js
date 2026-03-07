const axios = require('axios');
const responseParser = require('./response-parser.service');

// Execute an outbound HTTP request and return normalised result
async function execute(requestConfig) {
    const { method, url, headers, query_params, body, body_type, collection_id, request_id } = requestConfig;

    const finalHeaders = { ...headers };
    let finalBody = body;
    const normalizedBodyType = (body_type || 'none').toLowerCase();

    // Build a map of existing header keys (lowercased) for checking
    const lowerHeaders = Object.keys(finalHeaders).reduce((acc, key) => {
        acc[key.toLowerCase()] = key;
        return acc;
    }, {});

    // Handle JSON body
    if (normalizedBodyType === 'json' && body) {
        if (!lowerHeaders['content-type']) {
            finalHeaders['Content-Type'] = 'application/json';
        }

        // Try to parse string body to object so axios handles it as JSON
        if (typeof body === 'string') {
            try {
                finalBody = JSON.parse(body);
            } catch (e) {
                // If invalid JSON, leave as string and let server handle error
            }
        }
    }

    // Handle form-data body (sent as JSON with form-urlencoded content type)
    if (normalizedBodyType === 'form-data' && body) {
        if (!lowerHeaders['content-type']) {
            finalHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        // Try to parse JSON string into key-value pairs for form encoding
        if (typeof body === 'string') {
            try {
                const parsed = JSON.parse(body);
                if (typeof parsed === 'object' && parsed !== null) {
                    finalBody = new URLSearchParams(parsed).toString();
                }
            } catch (e) {
                // If not valid JSON, send as-is
            }
        }
    }

    // Handle raw body
    if (normalizedBodyType === 'raw' && body) {
        if (!lowerHeaders['content-type']) {
            finalHeaders['Content-Type'] = 'text/plain';
        }
    }

    const startTime = Date.now();
    try {
        const response = await axios({
            method: method || 'GET',
            url: url,
            headers: finalHeaders,
            params: query_params || {},
            data: finalBody,
            timeout: 30000,
            validateStatus: () => true // Don't throw on error status codes
        });

        const responseTime = Date.now() - startTime;

        return {
            status_code: response.status,
            response_time_ms: responseTime,
            response_headers: response.headers,
            response_body: response.data,
            success: response.status >= 200 && response.status < 300,
            collection_id,
            request_id
        };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        return {
            status_code: error.response?.status || 0,
            response_time_ms: responseTime,
            response_headers: error.response?.headers || {},
            response_body: error.response?.data || null,
            success: false,
            error_message: error.message,
            collection_id,
            request_id
        };
    }
}

// Save execution result to execution_history table
function saveHistory(db, data, userId, requestConfig) {
    const { request_id, collection_id, status_code, response_time_ms, response_headers, response_body, success, error_message } = data;
    const stmt = db.prepare(`
        INSERT INTO execution_history 
        (request_id, collection_id, status_code, response_time_ms, response_headers, response_body, success, error_message, user_id, method, url, request_headers, request_body, body_type, request_query_params) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
        request_id ? Number(request_id) : null,
        collection_id ? Number(collection_id) : null,
        status_code ?? null,
        response_time_ms ?? null,
        JSON.stringify(response_headers || {}),
        typeof response_body === 'object' ? JSON.stringify(response_body) : String(response_body ?? ''),
        success ? 1 : 0,
        error_message ?? null,
        Number(userId),
        requestConfig?.method || null,
        requestConfig?.url || null,
        JSON.stringify(requestConfig?.headers || {}),
        requestConfig?.body || null,
        requestConfig?.body_type || null,
        JSON.stringify(requestConfig?.query_params || {})
    );
    return { id: Number(info.lastInsertRowid), ...data, method: requestConfig?.method, url: requestConfig?.url, body_type: requestConfig?.body_type, user_id: userId };
}

// Get all history
function getHistory(db, userId) {
    const stmt = db.prepare('SELECT * FROM execution_history WHERE user_id = ? ORDER BY executed_at DESC LIMIT 50');
    return stmt.all(Number(userId)).map(item => {
        try {
            item.response_headers = JSON.parse(item.response_headers || '{}');
            item.response_body = JSON.parse(item.response_body || 'null');
        } catch (e) {
            // Leave as is if not valid JSON
        }
        return item;
    });
}

// Get history by ID
function getHistoryById(db, id, userId) {
    const stmt = db.prepare('SELECT * FROM execution_history WHERE id = ? AND user_id = ?');
    const item = stmt.get(Number(id), Number(userId));
    if (item) {
        try {
            item.response_headers = JSON.parse(item.response_headers || '{}');
            item.response_body = JSON.parse(item.response_body || 'null');
        } catch (e) { }
    }
    return item;
}

function removeHistory(db, id, userId) {
    const stmt = db.prepare('DELETE FROM execution_history WHERE id = ? AND user_id = ?');
    stmt.run(Number(id), Number(userId));
    return { success: true };
}

module.exports = { execute, saveHistory, getHistory, getHistoryById, removeHistory };
