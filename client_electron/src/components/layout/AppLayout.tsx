import React, { useEffect, useState } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from '../sidebar/Sidebar';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { CharacterSummary, CampaignSummary, WorldSummary } from '../../types/api';
import type { SystemAlertType } from '../../types/game';

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenWizard?: () => void;
  onCreateWorld?: () => void;
  onEditWorld?: (world: WorldSummary) => void;
  onCloneWorld?: (world: WorldSummary) => void;
  onRequestDeleteWorld?: (world: WorldSummary) => void;
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

const calcSecondsLeft = (expiresAt: number) =>
  Math.max(1, Math.min(5, Math.ceil((expiresAt - Date.now()) / 1000)));

const AlertCountdown: React.FC<AlertCountdownProps> = ({ expiresAt }) => {
  const [secondsLeft, setSecondsLeft] = useState(() => calcSecondsLeft(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(calcSecondsLeft(expiresAt));
    }, 250);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className="inline-flex items-center justify-center h-5 text-[11px] text-[#D1D5DB] font-mono tabular-nums leading-none">
      {secondsLeft}с
    </span>
  );
};

const ALERT_STYLES: Record<
  SystemAlertType,
  {
    container: string;
    icon: React.ReactNode;
    title: string;
  }
> = {
  error: {
    container: 'bg-[#7E0018]/95 border-[#9E0020] text-[#FDE8E8]',
    icon: <AlertCircle size={14} className="text-[#FCA5A5] shrink-0" />,
    title: 'Помилка:',
  },
  warning: {
    container: 'bg-[#78350F]/95 border-[#F59E0B]/70 text-[#FEF3C7]',
    icon: <AlertTriangle size={14} className="text-[#FBBF24] shrink-0" />,
    title: 'Увага:',
  },
  success: {
    container: 'bg-[#064E3B]/95 border-[#10B981]/70 text-[#D1FAE5]',
    icon: <CheckCircle2 size={14} className="text-[#34D399] shrink-0" />,
    title: 'Успішно:',
  },
  info: {
    container: 'bg-[#18202F]/95 border-[#3B82F6]/60 text-[#E5E7EB]',
    icon: <Info size={14} className="text-[#60A5FA] shrink-0" />,
    title: 'Інформація:',
  },
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  onOpenWizard,
  onCreateWorld,
  onEditWorld,
  onCloneWorld,
  onRequestDeleteWorld,
  onEditCharacter,
  onRequestDeleteCharacter,
  onNewCampaign,
  onRequestDeleteCampaign,
  onOpenSettings,
  onLogout,
}) => {
  const { systemAlert, isSystemAlertVisible, clearSystemAlert } = useGameStore();
  const alertType: SystemAlertType = systemAlert?.type || 'info';
  const alertTheme = ALERT_STYLES[alertType] || ALERT_STYLES.info;
  const showBanner = Boolean(systemAlert && isSystemAlertVisible);

  return (
    <div className="flex flex-col w-full h-full bg-[#121212] text-[#E5E7EB] overflow-hidden select-none">
      {/* 1. Custom Frameless TitleBar */}
      <TitleBar />

      {/* 2. Ephemeral System Alert (плавна двостороння поява/зникнення, семантика кольорів і ручне закриття) */}
      <div
        className={`grid transition-all duration-300 ease-out z-50 shrink-0 ${
          showBanner
            ? 'grid-rows-[1fr] opacity-100 translate-y-0'
            : 'grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden">
          {systemAlert && (
            <div
              className={`relative w-full backdrop-blur-sm border-b px-4 py-1.5 flex items-center justify-between gap-3 text-xs shadow-md ${alertTheme.container}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 min-h-5">
                <span className="inline-flex items-center justify-center h-5 shrink-0">
                  {alertTheme.icon}
                </span>
                <span className="inline-flex items-center h-5 font-semibold text-white shrink-0 leading-none">
                  {alertTheme.title}
                </span>
                <span className="break-words min-w-0 leading-5">
                  {systemAlert.message}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0 h-5">
                <AlertCountdown key={systemAlert.id} expiresAt={systemAlert.expiresAt} />
                <button
                  type="button"
                  onClick={clearSystemAlert}
                  data-tooltip="Закрити сповіщення"
                  className="w-5 h-5 rounded inline-flex items-center justify-center text-[#D1D5DB] transition-colors enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] enabled:cursor-pointer"
                >
                  <X size={13} className="block" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Головний робочий простір зі сплітом сайдбару */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          onOpenWizard={onOpenWizard}
          onCreateWorld={onCreateWorld}
          onEditWorld={onEditWorld}
          onCloneWorld={onCloneWorld}
          onRequestDeleteWorld={onRequestDeleteWorld}
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
