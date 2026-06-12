import { createRoot } from "react-dom/client";
import "./styles/system/index.css";
import { AuthProvider } from "./context/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
    <Analytics />
  </AuthProvider>
);
