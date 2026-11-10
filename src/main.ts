import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App).mount("#app");

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}play/sw.js`).catch(error => {
    console.warn("Kyrandia service worker could not start", error);
  });
}
