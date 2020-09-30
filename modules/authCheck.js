module.exports = (req, res, next) => {
    if (process.env.NODE_ENV !== "production") return next();
    if (req.isAuthenticated()) return next();
    if (req.method === "GET") return res.redirect(req.get("referrer"));
    return res.sendStatus(401);
}
