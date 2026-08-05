import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas dark:bg-dcanvas text-ink dark:text-dink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AppProvider>
          <BrowserRouter>
            <Layout />
          </BrowserRouter>
        </AppProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
