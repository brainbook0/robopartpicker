import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteLayout } from "@/components/layout/SiteLayout";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Robots from "./pages/Robots.tsx";
import RobotDetail from "./pages/RobotDetail.tsx";
import PartsCatalog from "./pages/PartsCatalog.tsx";
import PartDetail from "./pages/PartDetail.tsx";
import Finder from "./pages/Finder.tsx";
import Builder from "./pages/Builder.tsx";
import BomsIndex from "./pages/BomsIndex.tsx";
import BomDetail from "./pages/BomDetail.tsx";
import Marketplace from "./pages/Marketplace.tsx";
import ListingDetail from "./pages/ListingDetail.tsx";
import WantedNew from "./pages/WantedNew.tsx";
import ListingNew from "./pages/ListingNew.tsx";
import Suppliers from "./pages/Suppliers.tsx";
import SupplierDetail from "./pages/SupplierDetail.tsx";
import Teardowns from "./pages/Teardowns.tsx";
import Community from "./pages/Community.tsx";
import ForumCategory from "./pages/ForumCategory.tsx";
import ForumThread from "./pages/ForumThread.tsx";
import ForumNewThread from "./pages/ForumNewThread.tsx";
import Auth from "./pages/Auth.tsx";
import ProjectsIndex from "./pages/ProjectsIndex.tsx";
import ProjectNew from "./pages/ProjectNew.tsx";
import ProjectDetail from "./pages/ProjectDetail.tsx";
import RppsSpec from "./pages/RppsSpec.tsx";
import Assistant from "./pages/Assistant.tsx";
import PartCompare from "./pages/PartCompare.tsx";
import { AuthProvider } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<SiteLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/parts/compare" element={<PartCompare />} />
            <Route path="/parts/:category" element={<PartsCatalog />} />
            <Route path="/parts/:category/:slug" element={<PartDetail />} />
            <Route path="/projects" element={<ProjectsIndex />} />
            <Route path="/projects/new" element={<ProjectNew />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/rpps" element={<RppsSpec />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/assistant/:threadId" element={<Assistant />} />
            <Route path="/finder/:type" element={<Finder />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/boms" element={<BomsIndex />} />
            <Route path="/boms/:slug" element={<BomDetail />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/new" element={<ListingNew />} />
            <Route path="/marketplace/wanted/new" element={<WantedNew />} />
            <Route path="/marketplace/:id" element={<ListingDetail />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/suppliers/:slug" element={<SupplierDetail />} />
            <Route path="/robots" element={<Robots />} />
            <Route path="/robots/:slug" element={<RobotDetail />} />
            <Route path="/teardowns" element={<Teardowns />} />
            <Route path="/community" element={<Community />} />
            <Route path="/community/new" element={<ForumNewThread />} />
            <Route path="/community/c/:slug" element={<ForumCategory />} />
            <Route path="/community/t/:id" element={<ForumThread />} />
            <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
