import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { App } from "./App";
import "./index.css";

const APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    {APP_ID ? (
      <PrivyProvider
        appId={APP_ID}
        config={{
          loginMethods: ["email", "google"],
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          appearance: { theme: "light", accentColor: "#4a5d23" },
        }}
      >
        <App />
      </PrivyProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
