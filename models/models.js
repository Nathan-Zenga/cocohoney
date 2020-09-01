const { model, Schema } = require('mongoose');
Schema.Types.String.set('trim', true);

module.exports.Product = model('Product', Schema({
    name: String,
    price: { type: Number, set: n => parseFloat(n) * 100 },
    images: [{ p_id: String, url: String, main: { type: Boolean, default: false } }],
    category: { type: String, enum: ["lashes", "palette"] },
    product_collection: { type: String, default: "" },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] }
}));

module.exports.Member = model('Member', Schema({
    firstname: String,
    lastname: String,
    email: String,
    phone_number: String
}));

module.exports.Admin = model('Admin', (() => {
    const schema = new Schema({ email: { type: String, index: true }, password: String, tokenExpiryDate: Date });
    schema.virtual("username").get(() => this.email);
    return schema;
})());

module.exports.Lookbook_media = model('Lookbook_media', Schema({
    title: String,
    url: String,
    orientation: String,
    index: Number,
    media_type: { type: String, default: "image" },
    tutorial: { type: Boolean, default: false }
}));

module.exports.Site_content = model('Site_content', Schema({
    bg_underlay: String,
    overview_images: [{ url: String, index: Number }],
    highlight_media_large: String,
    highlight_media_small: String,
    highlight_media_text: String,
}));

module.exports.Shipping_fee = model('Shipping_fee', Schema({
    name: String,
    fee: { type: Number, set: n => parseFloat(n) * 100 }
}));
