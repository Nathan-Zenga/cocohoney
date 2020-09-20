const { model, Schema } = require('mongoose');
Schema.Types.String.set('trim', true);

module.exports.Sale = model('Sale', Schema({
    active: { type: Boolean, default: false }
}));

module.exports.Product = model('Product', Schema({
    name: { type: String, index: true },
    price: { type: Number, set: n => parseFloat(n) * 100 },
    price_sale: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : n },
    images: [{ p_id: String, url: String, main: { type: Boolean, default: false } }],
    category: { type: String, enum: ["lashes", "palettes"] },
    info: { type: String, default: "" },
    product_collection: { type: String, default: "" },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] }
}));

module.exports.Member = model('Member', Schema({
    firstname: String,
    lastname: String,
    email: String,
    phone_number: String
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

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

module.exports.Shipping_method = model('Shipping_method', Schema({
    name: String,
    info: String,
    fee: { type: Number, set: n => parseFloat(n) * 100 }
}));

module.exports.Discount_code = model('Discount_code', Schema({
    code: { type: String, required: true },
    percentage: { type: Number, min: 1, max: 100 },
    used: { type: Boolean, default: false },
    used_count: { type: Number, default: 0 },
    expiry_date: { type: Date, required: true }
}));

module.exports.Order = model('Order', Schema({
    basket: Array,
    discount_code: String
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

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
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.FAQ = model('FAQ', Schema({
    question: String,
    answer: String
}));
