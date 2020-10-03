module.exports = (req, res, next) => {
    if (req.isAuthenticated() || res.locals.user) return next();
    if (req.method === "GET") return res.redirect("/");
    return res.sendStatus(401);
}
