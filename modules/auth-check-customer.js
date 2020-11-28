module.exports = (req, res, next) => {
    if (res.locals.is_customer) return next();
    if (req.method === "GET") return res.redirect("/");
    return res.sendStatus(401);
}
