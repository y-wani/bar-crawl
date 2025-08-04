import { createRoot } from "react-dom/client";
import "./styles/global.css";
import "./theme/theme.css";
import { ThemeProvider } from "./theme/context";
import { AuthProvider } from "./context/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import SwirlBackground from "./components/SwirlBackground";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <SwirlBackground />
      <App />
      <Analytics />
    </AuthProvider>
  </ThemeProvider>
);
