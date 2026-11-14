import React, { useEffect, useState } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from '../sidebar/Sidebar';
import { Bell } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { CharacterSummary, CampaignSummary } from '../../types/api';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenWizard?: () => void;
  onEditCharacter?: (char: CharacterSummary) => void;
  onRequestDeleteCharacter?: (char: CharacterSummary) => void;
  onNewCampaign?: () => void;
  onRequestDeleteCampaign?: (camp: CampaignSummary) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

interface AlertCountdownProps {
  expiresAt: number;
}

const AlertCountdown: React.FC<AlertCountdownProps> = ({ expiresAt }) => {
  const [secondsLeft, setSecondsLeft] = useState(11);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(
        Math.max(1, Math.min(11, Math.ceil((expiresAt - Date.now()) / 1000)))
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className="text-[10px] text-[#D1D5DB] font-mono">
      {secondsLeft}с
    </span>
  );
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  onOpenWizard,
  onEditCharacter,
  onRequestDeleteCharacter,
  onNewCampaign,
  onRequestDeleteCampaign,
  onOpenSettings,
  onLogout,
}) => {
  const { systemAlert } = useGameStore();

  return (
    <div className="flex flex-col w-full h-full bg-[#121212] text-[#E5E7EB] overflow-hidden select-none">
      {/* 1. Custom Frameless TitleBar */}
      <TitleBar />

      {/* 2. Ephemeral System Alert (автозникнення за 11с) */}
      {systemAlert && (
        <div
          key={systemAlert.id}
          className="w-full bg-[#7E0018]/90 border-b border-[#EF4444]/40 px-4 py-1.5 flex items-center justify-between text-xs text-[#E5E7EB] z-50 animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <Bell size={13} className="text-[#EF4444] animate-pulse" />
            <span className="font-semibold text-white">Системне сповіщення:</span>
            <span>{systemAlert.message}</span>
          </div>
          <AlertCountdown key={systemAlert.id} expiresAt={systemAlert.expiresAt} />
        </div>
      )}

      {/* 3. Головний робочий простір зі сплітом сайдбару */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          onOpenWizard={onOpenWizard}
          onEditCharacter={onEditCharacter}
          onRequestDeleteCharacter={onRequestDeleteCharacter}
          onNewCampaign={onNewCampaign}
          onRequestDeleteCampaign={onRequestDeleteCampaign}
          onOpenSettings={onOpenSettings}
          onLogout={onLogout}
        />

        <main className="flex-1 h-full overflow-hidden flex flex-col relative">
          {children}
        </main>
      </div>
    </div>
  );
};
