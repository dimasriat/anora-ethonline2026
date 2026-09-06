import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <main>Anora</main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root tidak ada di index.html");
createRoot(root).render(<StrictMode><App /></StrictMode>);
