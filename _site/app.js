const menuToggle = document.querySelector(".header-menu");
const siteMenu = document.querySelector("#site-menu");

menuToggle.addEventListener("click", () => {
  const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isExpanded));
  siteMenu.hidden = isExpanded;
});

siteMenu.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuToggle.setAttribute("aria-expanded", "false");
  siteMenu.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || siteMenu.hidden) return;
  menuToggle.setAttribute("aria-expanded", "false");
  siteMenu.hidden = true;
  menuToggle.focus();
});

document.querySelector("#year").textContent = new Date().getFullYear();
