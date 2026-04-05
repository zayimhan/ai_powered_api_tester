// Resolves {{variable}} placeholders in URL, headers, and body

function resolve(template, variables = {}) {
    let result = JSON.stringify(template);
    for (const [key, value] of Object.entries(variables)) {
        // JSON-encode the value so that quotes/backslashes inside it don't break
        // the surrounding JSON string (e.g. a token with special chars).
        // JSON.stringify("abc") → '"abc"' — we only want the inner content, so slice off
        // the outer quotes that JSON.stringify adds.
        const safeValue = JSON.stringify(String(value)).slice(1, -1);
        result = result.replaceAll(`{{${key}}}`, safeValue);
    }
    return JSON.parse(result);
}

module.exports = { resolve };
