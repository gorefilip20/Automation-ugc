import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import UGCStudio from "./pages/UGCStudio";
import Campaigns from "./pages/Campaigns";
import GrowthOS from "./pages/GrowthOS";
import CrawlReview from "./pages/CrawlReview";
import CreatorCRM from "./pages/CreatorCRM";
import Outreach from "./pages/Outreach";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/ugc-studio" component={UGCStudio} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/growth-os" component={GrowthOS} />
      <Route path="/growth-os/review/:jobId" component={CrawlReview} />
      <Route path="/creator-crm" component={CreatorCRM} />
      <Route path="/outreach" component={Outreach} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
