const uaParser = require('./ua-parser');

module.exports = (req, res) => {
    const { browser, os, device } = new uaParser(req.headers['user-agent']).getResult();
    const ua = `browser: ${browser.name} ${browser.version}, os: ${os.name} ${os.version}, device: ${device.type}`.replace(/ ?undefined ?/g, "");
    return `method: ${req.method}, path: ${req.originalUrl}, host: ${req.headers.host}, status: ${res.statusCode} (${res.statusMessage}), ${ua}`;
};