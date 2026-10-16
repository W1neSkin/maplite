import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { PRODUCT_NAME } from "./brand.js"
import { App } from "./app/App.js"
import "ol/ol.css"
import "./index.css"

document.title = PRODUCT_NAME

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root")
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
