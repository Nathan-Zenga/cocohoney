const { model, Schema } = require('mongoose');

module.exports.Product = model('Product', Schema({
    name: String,
    price: { type: Number, set: n => parseInt(n) * 100 },
    image: String,
    type: String,
    group: String,
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] }
}));

module.exports.Member = model('Member', Schema({
    firstname: String,
    lastname: String,
    email: String,
    phone_number: String
}));
