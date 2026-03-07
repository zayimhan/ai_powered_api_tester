const axios = require('axios');

// Thin wrapper around axios to send outbound HTTP requests
async function send({ method, url, headers = {}, params = {}, data }) {
    return axios({ method, url, headers, params, data });
}

module.exports = { send };
