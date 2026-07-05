import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Dashboard from "@/pages/Dashboard";
import Saved from "@/pages/Saved";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/saved" element={<Saved />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
