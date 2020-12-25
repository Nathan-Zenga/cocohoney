const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const e = require('express');
const { OAuth2 } = require("googleapis").google.auth;
const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN, NODE_ENV } = process.env;

/** Class for processing mail transports */
class MailTransporter {
    #req; #res; #recipient; #recipients; #user; #pass; #getTransportOpts;

    /**
     * @param {object} routerParams route handler parameters, containing request and response objects
     * @param {e.Request} routerParams.req request object
     * @param {e.Response} routerParams.res response object
     * @param {(mongoose.Document | mongoose.Document[])} recipient new or existing (registered) recipient(s)
     */
    constructor(routerParams, recipient) {
        this.#req = routerParams.req;
        this.#res = routerParams.res;
        this.#recipient = !Array.isArray(recipient) ? recipient : null;
        this.#recipients = Array.isArray(recipient) ? recipient : [];
        const oauth2Client = new OAuth2( OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, "https://developers.google.com/oauthplayground" );
        oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });

        /**
         * Establishes authentication and passes transport objects to sendMail method
         * @param {function} cb callback
         */
        this.#getTransportOpts = cb => {
            nodemailer.createTestAccount((err, acc) => {
                oauth2Client.getAccessToken().then(response => {
                    cb(null, {
                        service: 'gmail', /* port: 465, secure: true, */
                        auth: {
                            type: "OAuth2",
                            user: this.#req.session.admin_email,
                            clientId: OAUTH_CLIENT_ID,
                            clientSecret: OAUTH_CLIENT_SECRET,
                            refreshToken: OAUTH_REFRESH_TOKEN,
                            accessToken: response.token
                        },
                        tls: { rejectUnauthorized: true }
                    });
                }).catch(err => {
                    if (NODE_ENV === "production") return cb(err);
                    this.#user = this.#user || acc.user; this.#pass = this.#pass || acc.pass;
                    cb(null, {
                        host: 'smtp.ethereal.email',
                        port: 587,
                        secure: false,
                        auth: { user: this.#user, pass: this.#pass }
                    });
                });
            })
        }
    };

    /**
     * Starts SMTP process of creating and sending new emails
     * @param {object} mailOpts contents to be applied to compose the email
     * @param {string} mailOpts.subject email subject
     * @param {string} mailOpts.message email message
     * @param {function} [cb] callback
     * @returns {Promise<nodemailer.SentMessageInfo>}
     */
    sendMail(mailOpts, cb) {
        return new Promise((resolve, reject) => {
            const { subject, message } = mailOpts;
            if (!this.#recipient && !this.#recipients.length) return (cb || reject)(Error("Recipient(s) not set"));
            if (!subject || !message) return (cb || reject)(Error("Subject and message cannot be empty"));
            this.#getTransportOpts((err, options) => {
                if (err) return (cb || reject)(Error(err.message || err));
                this.#res.render('templates/mail', { message, recipient: this.#recipient }, (err, html) => {
                    if (err) return (cb || reject)(Error(err.message));
                    nodemailer.createTransport(options).sendMail({
                        from: { name: "Cocohoney Cosmetics", email: this.#req.session.admin_email },
                        to: this.#recipient ? this.#recipient.email : this.#recipients.map(m => m.email),
                        subject,
                        html
                    }).then(() => (cb || resolve)()).catch(err => (cb || reject)(err));
                })
            });
        })
    };

    /** @param {mongoose.Document} recipient new or existing (registered) recipient */
    setRecipient(recipient) {
        this.#recipients = [];
        this.#recipient = recipient;
        return this
    };

    /** @param {mongoose.Document[]} recipients new or existing (registered) recipients */
    setRecipients(recipients) {
        this.#recipient = null;
        this.#recipients = recipients;
        return this
    };
};

module.exports = MailTransporter;
