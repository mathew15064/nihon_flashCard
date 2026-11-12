import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const element=document.getElementById("root");
if(!element)throw new Error("APP_ROOT_MISSING");
createRoot(element).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
