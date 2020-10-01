module.exports = (req, res, next) => {
    if (req.isAuthenticated() || req.session.user) return next();
    if (req.method === "GET") return res.redirect(req.get("referrer"));
    return res.sendStatus(401);
}
