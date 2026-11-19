import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./style.css";

// Disable default web right-click context menu on UI chrome while keeping it in editable text fields
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    target.closest(
      'textarea, [contenteditable="true"], input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="number"], input:not([type])'
    )
  ) {
    return;
  }
  e.preventDefault();
});

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
