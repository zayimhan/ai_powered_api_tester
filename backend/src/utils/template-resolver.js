// Resolves {{variable}} placeholders in URL, headers, and body

function resolve(template, variables = {}) {
    let result = JSON.stringify(template);
    for (const [key, value] of Object.entries(variables)) {
        result = result.replaceAll(`{{${key}}}`, value);
    }
    return JSON.parse(result);
}

module.exports = { resolve };
