import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Session from "./pages/Session";
import NotesList from "./pages/NotesList";
import NoteDetail from "./pages/NoteDetail";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/session/:id" element={<Session />} />
        <Route path="/notes" element={<NotesList />} />
        <Route path="/notes/:id" element={<NoteDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
