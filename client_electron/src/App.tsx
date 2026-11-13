import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Modal } from './components/ui/Modal';
import {
  Sparkles,
  Terminal,
  CheckCircle2,
  ShieldAlert,
  Server,
  User,
  Scroll,
  Bell,
  RefreshCw,
} from 'lucide-react';
import { useGameStore } from './store/useGameStore';

export const App: React.FC = () => {
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testInput, setTestInput] = useState('');

  const {
    characters,
    activeCharacter,
    campaigns,
    activeCampaign,
    isLoading,
    systemAlert,
    loadCharacters,
    setSystemAlert,
  } = useGameStore();

  useEffect(() => {
    loadCharacters().catch(() => {
      // Backend may not be running right now, safe fallback
    });
  }, [loadCharacters]);

  return (
    <div className="flex flex-col w-full h-full bg-[#121212] text-[#E5E7EB] overflow-hidden select-none">
      {/* 1. Custom Frameless TitleBar */}
      <TitleBar />

      {/* Ephemeral System Alert Banner (11 seconds) */}
      {systemAlert && (
        <div className="w-full bg-[#7E0018]/90 border-b border-[#EF4444]/40 px-4 py-2 flex items-center justify-between text-xs text-[#E5E7EB] animate-fade-in">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-[#EF4444] animate-pulse" />
            <span className="font-semibold text-white">Системне сповіщення:</span>
            <span>{systemAlert.message}</span>
          </div>
          <span className="text-[10px] text-[#9CA3AF]">
            автоочищення через 11с
          </span>
        </div>
      )}

      {/* 2. Main Container with Custom 4px Scrollbar */}
      <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center gap-6">
        <div className="max-w-xl w-full flex flex-col items-center text-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7E0018]/20 border border-[#7E0018]/40 text-[#EF4444] text-xs font-medium">
            <Sparkles size={14} />
            <span>Фаза 2: DTO v1.5.2 + Модульний API + Zustand Store</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-[#E5E7EB]">
            NOVA AI TRPG Client Core
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            Безрамочне вікно Electron 33+, нативний клієнт API v1.5.2, SSE стрімінг,
            Groq Whisper v3 сервіс та реактивне центральне сховище Zustand.
          </p>
        </div>

        {/* Live Backend & Store Status Card */}
        <div className="max-w-xl w-full bg-[#161616] border border-[#262626] rounded-xl p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#222222] pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#E5E7EB]">
              <Server size={16} className="text-[#10B981]" />
              <span>Шар комунікації API (v1.5.2) &amp; Zustand</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadCharacters()}
              disabled={isLoading}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw size={12} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Оновити
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#121212] border border-[#222222] rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
                <User size={13} className="text-[#EF4444]" />
                <span>Персонажі</span>
              </div>
              <span className="text-lg font-bold text-white">
                {characters.length}
              </span>
              <span className="text-[11px] text-[#6B7280] truncate">
                {activeCharacter ? activeCharacter.meta.name : 'Не вибрано'}
              </span>
            </div>

            <div className="bg-[#121212] border border-[#222222] rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
                <Scroll size={13} className="text-[#3B82F6]" />
                <span>Кампанії</span>
              </div>
              <span className="text-lg font-bold text-white">
                {campaigns.length}
              </span>
              <span className="text-[11px] text-[#6B7280] truncate">
                {activeCampaign ? activeCampaign.title : 'Не вибрано'}
              </span>
            </div>

            <div className="bg-[#121212] border border-[#222222] rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
                <Bell size={13} className="text-[#10B981]" />
                <span>Системне API</span>
              </div>
              <span className="text-lg font-bold text-[#10B981]">
                Готово
              </span>
              <span className="text-[11px] text-[#6B7280]">
                SSE + Whisper + Rollback
              </span>
            </div>
          </div>
        </div>

        {/* UI Kit Showcase Card */}
        <div className="max-w-xl w-full bg-[#161616] border border-[#262626] rounded-xl p-6 shadow-2xl flex flex-col gap-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E5E7EB] border-b border-[#222222] pb-3">
            <Terminal size={16} className="text-[#10B981]" />
            <span>Компонентний UI Kit &amp; Стан системи</span>
          </div>

          {/* Input component test */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[#9CA3AF]">Тестовий інпут із підсвіткою фокусу:</label>
            <Input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Введіть команду або дію персонажа..."
            />
          </div>

          {/* Button variants test */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[#9CA3AF]">Варіанти кнопок:</label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => setIsTestModalOpen(true)}>
                Primary (#7E0018)
              </Button>
              <Button
                variant="emerald"
                onClick={() => setSystemAlert('Тестове сповіщення: система активна та готова до Фази 3!')}
              >
                Сповіщення (11с)
              </Button>
              <Button variant="danger">
                Danger (#EF4444)
              </Button>
              <Button variant="secondary">
                Secondary
              </Button>
              <Button variant="ghost">
                Ghost
              </Button>
            </div>
          </div>

          {/* Checklist */}
          <div className="grid grid-cols-2 gap-2 text-xs text-[#9CA3AF] bg-[#121212] p-3 rounded-lg border border-[#222222]">
            <div className="flex items-center gap-1.5 text-[#10B981]">
              <CheckCircle2 size={13} />
              <span>DTO моделі API v1.5.2</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#10B981]">
              <CheckCircle2 size={13} />
              <span>Модульний API-клієнт</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#10B981]">
              <CheckCircle2 size={13} />
              <span>SSE стрімінг + Whisper v3</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#10B981]">
              <CheckCircle2 size={13} />
              <span>Zustand реактивне сховище</span>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Universal Modal Component Test */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Тестове модальне вікно"
        description="Перевірка затемнення оверлею та центрованого UI-компонента."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsTestModalOpen(false)}>
              Скасувати
            </Button>
            <Button variant="emerald" onClick={() => setIsTestModalOpen(false)}>
              Підтвердити
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[#7E0018]/10 border border-[#7E0018]/30 text-xs text-[#E5E7EB]">
          <ShieldAlert size={16} className="text-[#EF4444] shrink-0 mt-0.5" />
          <span>
            Модальне вікно підтримує закриття по Escape, клік поза межами та типізовані пропси футера.
          </span>
        </div>
      </Modal>
    </div>
  );
};

export default App;
