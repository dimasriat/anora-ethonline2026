import React from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import { PrivySession } from "./PrivySession";
import "./index.css";
import "./dashboard.css";

const SIMULATED = import.meta.env.VITE_ADAPTER_IDENTITY === "demo";
const APP_ID = SIMULATED ? undefined : (import.meta.env.VITE_PRIVY_APP_ID as string | undefined);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {APP_ID ? (
      <PrivyProvider
        appId={APP_ID}
        config={{
          loginMethods: ["email", "google"],
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          appearance: { theme: "light", accentColor: "#c3e01e" },
        }}
      >
        <PrivySession>
          <App />
        </PrivySession>
      </PrivyProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
