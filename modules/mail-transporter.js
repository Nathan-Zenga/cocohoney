const path = require('path');
const nodemailer = require('nodemailer');
const { renderFile } = require('ejs');
const { Document: Doc } = require('mongoose');
const SMTPTransport = require('nodemailer/lib/smtp-transport');
const { OAuth2 } = (require("googleapis")).google.auth;
const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN, NODE_ENV, CHC_EMAIL } = process.env;

/** Class for processing mail transports */
class MailTransporter {
    #recipient; #recipients; #oauth2Client;

    /** @param {(Doc | Doc[])} recipient registered recipient(s) */
    constructor(recipient) {
        this.#recipient = !Array.isArray(recipient) ? recipient : null;
        this.#recipients = Array.isArray(recipient) ? recipient : [];
        this.#oauth2Client = new OAuth2( OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, "https://developers.google.com/oauthplayground" );
        this.#oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });
    };

    /**
     * Passes transport objects to sendMail method for authentication
     * @returns {Promise<SMTPTransport.Options>}
     */
    async #getTransportOpts () {
        try {
            const response = await this.#oauth2Client.getAccessToken();
            return {
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
            };
        } catch(err) {
            if (NODE_ENV === "production") throw err;
            const acc = await nodemailer.createTestAccount();
            return {
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: { user: acc.user, pass: acc.pass }
            }
        }
    };

    /**
     * Starts SMTP process of creating and sending new emails
     * @param {object} mail_opts contents to be applied to compose the email
     * @param {string} mail_opts.subject email subject
     * @param {string} mail_opts.message email message
     * @param {function} [cb] callback
     */
    async sendMail({ subject, message }, cb) {
        try {
            if (!this.#recipient && !this.#recipients.length) throw Error("Recipient(s) not set");
            if (!subject || !message) throw Error("Subject and message cannot be empty");
            const template = path.join(__dirname, '../views/templates/mail.ejs');
            const html = await renderFile(template, { message, recipient: this.#recipient, location_origin: MailTransporter.location_origin });
            const options = await this.#getTransportOpts();
            const from = { name: "Cocohoney Cosmetics", address: CHC_EMAIL };
            const to = this.#recipient?.email || this.#recipients.map(m => m.email);
            await nodemailer.createTransport(options).sendMail({ from, to, subject, html });
            cb?.();
        } catch(err) { if (!cb) throw err; cb(err) }
    };

    /** @param {Doc} recipient registered recipient */
    setRecipient(recipient) {
        this.#recipient = recipient;
        this.#recipients = [];
        return this
    };

    /** @param {Doc[]} recipients registered recipients */
    setRecipients(recipients) {
        this.#recipient = null;
        this.#recipients = recipients;
        return this
    };
};

MailTransporter.location_origin = "";

module.exports = MailTransporter;
