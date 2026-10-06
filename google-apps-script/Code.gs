const SPREADSHEET_ID = "1ld_8HJKfQkT_b5zDeL2KKhjjrNF2qu7ApUHbVSkJ6MY";
const SHEET_NAME = "TradWedDress";
const NOTIFICATION_EMAIL = "masasecomm@gmail.com";
const HEADERS = ["Received at", "Names", "Email", "Phone", "Message"];

function doPost(event) {
  try {
    const fields = event && event.parameter ? event.parameter : {};
    if (fields.website) return response(true);

    const name = clean(fields.name, 150);
    const email = clean(fields.email, 254).toLowerCase();
    const phone = clean(fields.phone, 40);
    const message = clean(fields.message, 5000);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response(false);
    }

    const cache = CacheService.getScriptCache();
    const emailKey = `recent-contact-${Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
    )}`;
    if (cache.get(emailKey)) return response(false);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error(`The "${SHEET_NAME}" tab was not found.`);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    const receivedAt = new Date();
    sheet.appendRow([receivedAt, safeCell(name), safeCell(email), safeCell(phone), safeCell(message)]);
    MailApp.sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: `Traditional Wedding Dress contact: ${name}`,
      body: [
        "A new contact form message was submitted.",
        "",
        `Names: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "Not provided"}`,
        `Message: ${message || "Not provided"}`,
        `Received: ${receivedAt.toISOString()}`
      ].join("\n"),
      replyTo: email,
      name: "Traditional Wedding Dress"
    });
    cache.put(emailKey, "1", 60);
    return response(true);
  } catch (error) {
    console.error("Contact form submission failed", error);
    return response(false);
  }
}

function clean(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength);
}

function safeCell(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function response(success) {
  return HtmlService.createHtmlOutput(
    `<script>window.top.postMessage({type:"contact-form-result",success:${success}}, "*");</script>`
  );
}
