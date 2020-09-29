const { model, Schema } = require('mongoose');
Schema.Types.String.set('trim', true);

module.exports.Sale = model('Sale', Schema({
    active: { type: Boolean, default: false }
}));

module.exports.Product = model('Product', Schema({
    name: { type: String, index: true },
    price: { type: Number, set: n => parseFloat(n) * 100 },
    price_amb: { type: Number, default: null, set: n => n ? parseFloat(n) * 100 : n },
    image: { p_id: String, url: String },
    category: { type: String, enum: ["lashes", "palettes"] },
    info: { type: String, default: "" },
    product_collection: { type: String, default: "" },
    stock_qty: { type: Number, min: [0, "No negative values allowed for stock quantity"] }
}));

module.exports.Member = model('Member', Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true },
    phone_number: { type: String, minlength: 11, maxlength: 11 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Admin = model('Admin', (() => {
    const schema = new Schema({
        email: { type: String, index: true, required: true },
        password: { type: String, required: true },
        token_expiry_date: Date
    });
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

module.exports.Discount_code = model('Discount_code', (() => {
    const schema = new Schema({
        code: { type: String, required: true },
        percentage: { type: Number, min: 1, max: 100 },
        max_use_limit: { type: Number, min: 1, default: 1 },
        orders_applied: [String],
        expiry_date: { type: Date, required: true }
    });

    schema.virtual("max_reached").get((val, vt, doc) => doc.orders_applied.length === doc.max_use_limit);
    return schema;
})());

module.exports.Order = model('Order', Schema({
    cart: Array,
    discounted: { type: Boolean, default: false },
    customer_name: String,
    customer_email: String
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.Ambassador = model('Ambassador', Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true },
    phone_number: { type: String, minlength: 11, maxlength: 11 },
    instagram: { type: String, set: v => v.trim().replace(/^\@/, "") },
    password: { type: String, required: [() => this.verified === true, "Account needs to be verified first to set a new password"] },
    token: String,
    verified: { type: Boolean, default: false },
    discount_code: { type: String, default: null },
    ambassador: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));

module.exports.FAQ = model('FAQ', Schema({
    question: String,
    answer: String
}));

module.exports.Box = model('Box', Schema({
    name: String,
    price: { type: Number, set: n => parseFloat(n) * 100 },
    info: String,
    max_items: Number,
    image: { p_id: String, url: String }
}));

module.exports.Review = model('Review', Schema({
    headline: String,
    commentry: { type: String, required: true },
    author_name: { type: String, required: true },
    author_verified: { type: Boolean, default: false },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    images: [{ p_id: String, url: String }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }));
