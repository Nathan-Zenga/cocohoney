const { default: axios } = require("axios");

module.exports = async (req, res, next) => {
    const response = req.body["g-recaptcha-response"];
    if (!response) return res.status(400).send("Sorry, we need to verify that you're not a robot.\nPlease tick the box to proceed.");
    const params = new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response, remoteip: req.socket.remoteAddress });
    const verifyURL = "https://google.com/recaptcha/api/siteverify?" + params.toString();
    const { data: result } = await axios.get(verifyURL).catch(e => e);
    if (!result?.success) return res.status(400).send("Failed CAPTCHA verification");
    next();
}