const { each, forEachOf } = require("async");
const { Sale, Product, Box } = require("../models/models");

module.exports = async req => {
    const { sale_on, sitewide, id, percentage, end_date, end_hour, end_minute } = req.body;
    const docs = await Sale.find();
    const sale = docs.length ? docs[0] : new Sale();
    const ids = (Array.isArray(id) ? id : [id]).filter(e => e);
    const percentages = (Array.isArray(percentage) ? percentage : [percentage]).filter(e => e);
    if (percentages.find(p => isNaN(parseInt(p)))) return { status: 400, response: "Percentage is invalid" };
    if (percentages.find(p => parseInt(p) <= 0)) return { status: 400, response: "Percentage cannot be less than or equal to 0" };
    if (ids.length !== percentages.length && !sitewide) return { status: 400, response: "Uneven number of selected items and specified percentages" };

    sale.active = false;
    sale.sitewide = false;
    sale.percentage = undefined;
    sale.end_datetime = undefined;
    await Product.updateMany({}, { $set: { price_sale: undefined } });
    await Box.updateMany({}, { $set: { price_sale: undefined } });
    if (!sale_on) return sale.save(err => ({ response: "Sale period now turned off" }));

    sale.active = true;
    const products = await Product.find();
    const boxes = await Box.find();
    const result = {};

    const datetime = new Date(end_date);
    datetime.setHours(end_hour, end_minute, 0, 0);
    if (datetime < Date.now()) return { status: 400, response: "Cannot set past date" };
    sale.end_datetime = datetime;

    try {
        if (sitewide) {
            sale.sitewide = true;
            sale.percentage = percentage;
            await each([...products, ...boxes], (item, cb) => {
                const sale_discount = (parseInt(percentage) / 100) * item.price;
                item.price_sale = ((item.price - sale_discount) / 100).toFixed(2);
                item.save(err => cb());
            });
            result.response = "Sale period now started site wide";

        } else {
            await forEachOf(ids, (product_id, i, cb) => {
                const product = products.find(p => p.id == product_id);
                const box = boxes.find(p => p.id == product_id);
                const item = product || box;
                const percent = parseInt(percentages[i]);
                if (!item) return cb();
                const sale_discount = (percent / 100) * item.price;
                item.price_sale = ((item.price - sale_discount) / 100).toFixed(2);
                item.save(err => err ? cb(err) : cb());
            });
            result.response = "Sale period now started for the selected products";
        }
        await sale.save(); return result;
    } catch(err) { return { status: 500, response: err.message } }
}
