module.exports = (req, res, next) => {
    if (res.locals.user && !res.locals.is_ambassador && !res.locals.is_admin) return next();
    if (req.method === "GET") return res.redirect("/");
    return res.sendStatus(401);
}
