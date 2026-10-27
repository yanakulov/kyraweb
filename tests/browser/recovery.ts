// Development-only fixture: fail the first pack request, then exercise real retry UI.
import { createApp } from "vue";
import App from "../../src/App.vue";
import "../../src/styles.css";

const originalFetch = window.fetch.bind(window);
let failOnce = true;
window.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (failOnce && url.includes("/westwood.kyr.gz")) {
    failOnce = false;
    return Promise.resolve(new Response("Deliberate test failure", { status: 503 }));
  }
  return originalFetch(input, init);
};
createApp(App).mount("#app");
