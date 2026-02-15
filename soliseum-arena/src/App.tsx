import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { WalletButton } from "@/components/WalletButton";
import { NetworkGuardian } from "@/components/NetworkGuardian";
import { WalletContextProvider } from "@/contexts/WalletContextProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { APP_CLUSTER } from "@/config/soliseum";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import BattleStation from "./pages/BattleStation";
import VictoryHall from "./pages/VictoryHall";
import Leaderboard from "./pages/Leaderboard";
import AgentLab from "./pages/AgentLab";
import MyStakes from "./pages/MyStakes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Layout component that conditionally shows sidebar
const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isLandingPage = location.pathname === "/";

  if (isLandingPage) {
    // Landing page without sidebar or top bar
    return <div className="w-full min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Network Guardian - top-bar urgent alert when on devnet */}
        <LayoutNetworkGuardian />
        {/* Top bar with wallet */}
        <div className="flex items-center justify-end px-4 py-2 border-b border-border glass">
          <WalletButton />
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
};

function LayoutNetworkGuardian() {
  const { connected } = useWallet();
  return <NetworkGuardian cluster={APP_CLUSTER} isConnected={connected} />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <WalletContextProvider>
      <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/arena" element={<Index />} />
              <Route path="/arena/battle/:battleId" element={<BattleStation />} />
              <Route path="/arena/battle/:battleId/result" element={<VictoryHall />} />
              <Route path="/stakes" element={<MyStakes />} />
              <Route path="/agents" element={<AgentLab />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
      </AuthProvider>
    </WalletContextProvider>
  </QueryClientProvider>
);

export default App;
