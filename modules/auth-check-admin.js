module.exports = (req, res, next) => {
    if (req.isAuthenticated() && res.locals.is_admin) return next();
    if (req.method === "GET") return res.redirect("/");
    return res.status(401).send("Cannot perform this action as you are not logged in");
}
