const path = require('path');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const { Document: Doc } = require('mongoose');
const { OAuth2 } = (require("googleapis")).google.auth;
const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN, NODE_ENV, CHC_EMAIL } = process.env;

/** Class for processing mail transports */
class MailTransporter {
    #recipient; #recipients; #user; #pass; #getTransportOpts;

    /** @param {(Doc | Doc[])} recipient new or already registered recipient(s) */
    constructor(recipient) {
        this.#recipient = !Array.isArray(recipient) ? recipient : null;
        this.#recipients = Array.isArray(recipient) ? recipient : [];
        const oauth2Client = new OAuth2( OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, "https://developers.google.com/oauthplayground" );
        oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });

        /**
         * Establishes authentication and passes transport objects to sendMail method
         * @param {function} cb callback
         */
        this.#getTransportOpts = cb => {
            oauth2Client.getAccessToken().then(response => {
                cb(null, {
                    service: 'gmail', /* port: 465, secure: true, */
                    auth: {
                        type: "OAuth2",
                        user: CHC_EMAIL,
                        clientId: OAUTH_CLIENT_ID,
                        clientSecret: OAUTH_CLIENT_SECRET,
                        refreshToken: OAUTH_REFRESH_TOKEN,
                        accessToken: response.token
                    },
                    tls: { rejectUnauthorized: true }
                });
            }).catch(err => {
                if (NODE_ENV === "production") return cb(err);
                nodemailer.createTestAccount((err, acc) => {
                    this.#user = this.#user || acc.user;
                    this.#pass = this.#pass || acc.pass;
                    cb(null, {
                        host: 'smtp.ethereal.email',
                        port: 587,
                        secure: false,
                        auth: { user: this.#user, pass: this.#pass }
                    })
                })
            })
        }
    };

    /**
     * Starts SMTP process of creating and sending new emails
     * @param {object} mail_opts contents to be applied to compose the email
     * @param {string} mail_opts.subject email subject
     * @param {string} mail_opts.message email message
     * @param {function} [cb] callback
     * @returns {Promise<nodemailer.SentMessageInfo>}
     */
    sendMail(mail_opts, cb) {
        return new Promise((resolve, reject) => {
            const { subject, message } = mail_opts;
            if (!this.#recipient && !this.#recipients.length) return (cb || reject)(Error("Recipient(s) not set"));
            if (!subject || !message) return (cb || reject)(Error("Subject and message cannot be empty"));
            this.#getTransportOpts((err, options) => {
                if (err) return (cb || reject)(err);
                const template = path.join(__dirname, '../views/templates/mail.ejs');
                ejs.renderFile(template, { message, recipient: this.#recipient }, (err, html) => {
                    if (err) return (cb || reject)(err);
                    nodemailer.createTransport(options).sendMail({
                        from: { name: "Cocohoney Cosmetics", address: CHC_EMAIL },
                        to: this.#recipient ? this.#recipient.email : this.#recipients.map(m => m.email),
                        subject,
                        html
                    }).then(() => (cb || resolve)()).catch(err => (cb || reject)(err));
                })
            })
        })
    };

    /** @param {Doc} recipient new or already registered recipient */
    setRecipient(recipient) {
        this.#recipients = [];
        this.#recipient = recipient;
        return this
    };

    /** @param {Doc[]} recipients new or already registered recipients */
    setRecipients(recipients) {
        this.#recipient = null;
        this.#recipients = recipients;
        return this
    };
};

module.exports = MailTransporter;
