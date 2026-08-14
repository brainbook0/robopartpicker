import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteLayout } from "@/components/layout/SiteLayout";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import PartsCatalog from "./pages/PartsCatalog.tsx";
import PartDetail from "./pages/PartDetail.tsx";
import Finder from "./pages/Finder.tsx";
import Builder from "./pages/Builder.tsx";
import BomsIndex from "./pages/BomsIndex.tsx";
import BomDetail from "./pages/BomDetail.tsx";
import Marketplace from "./pages/marketplace/MarketplaceD1.tsx";
import ListingDetail from "./pages/marketplace/ListingDetailD1.tsx";
import WantedNew from "./pages/marketplace/WantedEditorD1.tsx";
import ListingNew from "./pages/marketplace/ListingEditorD1.tsx";
import Suppliers from "./pages/Suppliers.tsx";
import SupplierDetail from "./pages/SupplierDetail.tsx";
import Teardowns from "./pages/Teardowns.tsx";
import Community from "./pages/Community.tsx";
import ForumCategory from "./pages/ForumCategory.tsx";
import ForumThread from "./pages/ForumThread.tsx";
import ForumNewThread from "./pages/ForumNewThread.tsx";
import Auth from "./pages/Auth.tsx";
import OAuthConsent from "./pages/OAuthConsent.tsx";
import ProjectsIndex from "./pages/ProjectsIndex.tsx";
import ProjectNew from "./pages/ProjectNew.tsx";
import ProjectDetail from "./pages/ProjectDetail.tsx";
import ProjectInsight from "./pages/ProjectInsight.tsx";
import RppsSpec from "./pages/RppsSpec.tsx";
import Assistant from "./pages/Assistant.tsx";
import PartCompare from "./pages/PartCompare.tsx";
import Search from "./pages/Search.tsx";
import Notifications from "./pages/Notifications.tsx";
import Organizations from "./pages/Organizations.tsx";
import OrganizationDetail from "./pages/OrganizationDetail.tsx";
import Developers from "./pages/Developers.tsx";
import Partners from "./pages/Partners.tsx";
import About from "./pages/About.tsx";
import QuoteDetail from "./pages/QuoteDetail.tsx";
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
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route element={<SiteLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/parts/compare" element={<PartCompare />} />
            <Route path="/search" element={<Search />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/organizations" element={<Organizations />} />
            <Route path="/organizations/:id" element={<OrganizationDetail />} />
            <Route path="/developers" element={<Developers />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/about" element={<About />} />
            <Route path="/quotes/:id" element={<QuoteDetail />} />
            <Route path="/parts/:category" element={<PartsCatalog />} />
            <Route path="/parts/:category/:slug" element={<PartDetail />} />
            <Route path="/projects" element={<ProjectsIndex />} />
            <Route path="/projects/new" element={<ProjectNew />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/projects/:slug/:aspect" element={<ProjectInsight />} />
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
            <Route path="/robots" element={<ProjectsIndex />} />
            <Route path="/robots/:slug" element={<ProjectDetail />} />
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
