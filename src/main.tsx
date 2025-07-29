import { createRoot } from "react-dom/client";
import "./styles/global.css";
import "./theme/theme.css";
import { ThemeProvider } from "./theme/context";
import { AuthProvider } from "./context/AuthContext";
import SwirlBackground from "./components/SwirlBackground";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AuthProvider>
      <SwirlBackground />
      <App />
    </AuthProvider>
  </ThemeProvider>
);
