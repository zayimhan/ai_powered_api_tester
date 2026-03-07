// Normalises the raw axios response into a clean object for the frontend

function parse(axiosResponse) {
    return {
        statusCode: axiosResponse.status,
        headers: axiosResponse.headers,
        body: axiosResponse.data,
        responseTimeMs: null, // populated by execution.service
    };
}

module.exports = { parse };
