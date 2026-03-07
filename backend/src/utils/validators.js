// Simple request validator helper

function validateRequestBody(body) {
    const errors = [];
    if (!body.method) errors.push('method is required');
    if (!body.url) errors.push('url is required');
    return errors;
}

module.exports = { validateRequestBody };
