module.exports = (req, res, next) => {
    if (process.env.NODE_ENV !== "production") return next();
    if (req.isAuthenticated()) return next();
    if (req.method === "GET") return res.status(401).redirect("/admin/login");
    return res.sendStatus(401);
}
