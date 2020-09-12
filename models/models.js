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
    const schema = new Schema({ email: { type: String, index: true }, password: String, token_expiry_date: Date });
    schema.virtual("username").get(() => this.email);
    return schema;
})());

module.exports.Lookbook_media = model('Lookbook_media', Schema({
    p_id: String,
    url: String,
    orientation: String,
    index: Number,
    media_type: { type: String, default: "image" },
    tutorial: { type: Boolean, default: false }
}));

module.exports.Site_content = model('Site_content', Schema({
    background_image: String,
    socials: [{
        name: String,
        url: { type: String, set: v => !/^https?:\/\//i.test(v) ? "https://" + v : v }
    }]
}));

module.exports.Banner_slide = model('Banner_slide', Schema({
    text: String
}));

module.exports.Overview_image = model('Overview_image', Schema({
    url: String,
    index: Number
}));

module.exports.Hightlight_media = model('Hightlight_media', Schema({
    media_lg_url: String,
    media_sm_url: String,
    media_text: String,
}));

module.exports.Shipping_fee = model('Shipping_fee', Schema({
    name: String,
    fee: { type: Number, set: n => parseFloat(n) * 100 }
}));

module.exports.Discount_code = model('Discount_code', Schema({
    code: { type: String, required: true },
    expiry_date: { type: Date, required: true }
}));

module.exports.Ambassador = model('Ambassador', Schema({
    firstname: String,
    lastname: String,
    email: String,
    phone_number: String,
    instagram: { type: String, set: v => v.trim().replace(/^\@/, "") },
    password: { type: String, required: [() => this.verified === true, "Account needs to be verified first to set a new password"] },
    token: String,
    verified: { type: Boolean, default: false },
    discount_code: { type: String, default: null }
}));

module.exports.FAQ = model('FAQ', Schema({
    question: String,
    answer: String
}));
