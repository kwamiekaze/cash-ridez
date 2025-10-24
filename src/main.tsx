import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Preload critical fonts and assets
if ('fonts' in document) {
  // @ts-ignore
  document.fonts.ready.then(() => {
    document.documentElement.classList.add('fonts-loaded');
  });
}

createRoot(document.getElementById("root")!).render(<App />);
