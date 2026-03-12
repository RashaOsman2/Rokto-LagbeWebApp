import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register Firebase service worker for background push notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('Firebase SW registered:', registration.scope);
    })
    .catch((error) => {
      console.log('Firebase SW registration failed:', error);
    });
}

createRoot(document.getElementById("root")!).render(<App />);
