const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-status");
const contactConfig = window.APP_CONFIG;
const contactEndpoint = contactConfig?.contactFormScriptUrl?.trim();
const validContactEndpoint = (() => {
  try {
    const url = new URL(contactEndpoint);
    return url.protocol === "https:"
      && url.hostname === "script.google.com"
      && /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname);
  } catch {
    return false;
  }
})();
let submissionTimeout;

if (validContactEndpoint) {
  contactForm.action = contactEndpoint;
} else {
  contactStatus.textContent = contactEndpoint
    ? "The contact form connection is invalid. Please contact the site owner."
    : "The contact form is not connected yet. Please try again later.";
  contactForm.querySelector('button[type="submit"]').disabled = true;
}

window.addEventListener("message", (event) => {
  const frame = document.querySelector('iframe[name="contact-result"]');
  if (event.source !== frame.contentWindow || event.data?.type !== "contact-form-result") return;
  window.clearTimeout(submissionTimeout);
  contactForm.querySelector('button[type="submit"]').disabled = false;
  if (event.data.success === true) {
    contactForm.reset();
    contactStatus.textContent = "Thank you. Your message has been sent successfully.";
  } else {
    contactStatus.textContent = "We could not send your message. Please check the details and try again.";
  }
});

contactForm.addEventListener("submit", (event) => {
  if (!validContactEndpoint) {
    event.preventDefault();
    return;
  }
  contactStatus.textContent = "Sending your message…";
  contactForm.querySelector('button[type="submit"]').disabled = true;
  window.clearTimeout(submissionTimeout);
  submissionTimeout = window.setTimeout(() => {
    if (contactStatus.textContent === "Sending your message…") {
      contactStatus.textContent = "We did not receive a confirmation. Please check your connection and try again.";
      contactForm.querySelector('button[type="submit"]').disabled = false;
    }
  }, 15000);
});
