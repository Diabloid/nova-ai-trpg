import React, { useState, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { HeaderStatusBar } from './components/character-drawer/HeaderStatusBar';
import { DrawerSheet } from './components/character-drawer/DrawerSheet';
import { ChatContainer } from './components/chat/ChatContainer';
import { ChatInput } from './components/input/ChatInput';
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { useGameStore } from './store/useGameStore';
import type { CharacterSummary, CampaignSummary } from './types/api';

export const App: React.FC = () => {
  const {
    loadCharacters,
    createCampaign,
    deleteCampaign,
    deleteCharacter,
    setSystemAlert,
  } = useGameStore();

  // Стан модальних вікон
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [newCampaignTitle, setNewCampaignTitle] = useState('');

  const [campaignToDelete, setCampaignToDelete] = useState<CampaignSummary | null>(null);
  const [characterToDelete, setCharacterToDelete] = useState<CharacterSummary | null>(null);

  // Завантаження персонажів на старті
  useEffect(() => {
    loadCharacters().catch((err) => {
      console.warn('Не вдалося завантажити героїв під час старту:', err);
    });
  }, [loadCharacters]);

  // Створення нової кампанії
  const handleCreateCampaign = async () => {
    const title = newCampaignTitle.trim();
    setIsNewCampaignModalOpen(false);
    setNewCampaignTitle('');
    try {
      await createCampaign(title || undefined);
    } catch (err: any) {
      setSystemAlert(`Помилка створення кампанії: ${err.message}`, 'error');
    }
  };

  // Видалення кампанії
  const handleConfirmDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    const campId = campaignToDelete.campaign_id;
    setCampaignToDelete(null);
    try {
      await deleteCampaign(campId);
    } catch (err: any) {
      setSystemAlert(`Помилка видалення кампанії: ${err.message}`, 'error');
    }
  };

  // Видалення персонажа
  const handleConfirmDeleteCharacter = async () => {
    if (!characterToDelete) return;
    const charId = characterToDelete.char_id;
    setCharacterToDelete(null);
    try {
      await deleteCharacter(charId);
    } catch (err: any) {
      setSystemAlert(`Помилка видалення героя: ${err.message}`, 'error');
    }
  };

  return (
    <AppLayout
      onOpenWizard={() => {
        setSystemAlert('Візард Творця Долі заплановано на Фазу 4', 'info');
      }}
      onNewCampaign={() => setIsNewCampaignModalOpen(true)}
      onRequestDeleteCampaign={(camp) => setCampaignToDelete(camp)}
      onRequestDeleteCharacter={(char) => setCharacterToDelete(char)}
      onOpenSettings={() => {
        setSystemAlert('Налаштування клієнта активні', 'info');
      }}
      onLogout={() => {
        setSystemAlert('Сесію завершено', 'info');
      }}
    >
      {/* 1. ІГРОВИЙ ЕКРАН 1-в-1 з Avalonia Grid Margin="42,40,24,24" */}
      <div className="flex-1 overflow-hidden pl-[42px] pt-[40px] pr-[24px] pb-[24px] flex flex-col justify-between">
        {/* ВЕРХНЯ ПАНЕЛЬ: Картка персонажа Button.characterCard + Висувна шторка Border.drawerSheet */}
        <div className="mb-4 flex flex-col gap-1 shrink-0">
          <HeaderStatusBar />
          <DrawerSheet />
        </div>

        {/* ЛОГ ПОВІДОМЛЕНЬ + ІНДИКАТОР: Border.chatContainer (Row="1") */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <ChatContainer />
        </div>

        {/* ПОЛЕ ВВОДУ ТА ЕЛЕМЕНТИ (Row="2" Margin="0,16,0,0") */}
        <div className="mt-4 shrink-0">
          <ChatInput />
        </div>
      </div>

      {/* Модальне вікно: Створення нової кампанії */}
      <Modal
        isOpen={isNewCampaignModalOpen}
        onClose={() => setIsNewCampaignModalOpen(false)}
        title="НОВА КАМПАНІЯ"
        description="Введіть назву для нової пригоди обраного героя."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setIsNewCampaignModalOpen(false)}
            >
              Скасувати
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateCampaign}
            >
              Створити
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 pt-2">
          <label className="text-xs text-[#9CA3AF]">Назва кампанії:</label>
          <Input
            value={newCampaignTitle}
            onChange={(e) => setNewCampaignTitle(e.target.value)}
            placeholder="Наприклад: Похід на Північні пагорби"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateCampaign();
            }}
          />
        </div>
      </Modal>

      {/* Модальне вікно: Підтвердження видалення кампанії (безпечна смарагдова кнопка «Ні») */}
      <Modal
        isOpen={!!campaignToDelete}
        onClose={() => setCampaignToDelete(null)}
        title="ВИДАЛИТИ КАМПАНІЮ?"
        description={`Ви впевнені, що бажаєте безповоротно видалити кампанію «${campaignToDelete?.title}»?`}
        footer={
          <>
            <Button
              variant="emerald"
              onClick={() => setCampaignToDelete(null)}
            >
              Ні, залишити
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDeleteCampaign}
            >
              Видалити
            </Button>
          </>
        }
      >
        <div className="p-3 bg-[#7E0018]/10 border border-[#7E0018]/30 rounded-lg text-xs text-[#E5E7EB]">
          Увесь збережений прогрес та історія чату цієї кампанії будуть втрачені.
        </div>
      </Modal>

      {/* Модальне вікно: Підтвердження видалення персонажа */}
      <Modal
        isOpen={!!characterToDelete}
        onClose={() => setCharacterToDelete(null)}
        title="ВИДАЛИТИ ПЕРСОНАЖА?"
        description={`Ви впевнені, що бажаєте видалити персонажа «${characterToDelete?.name}»?`}
        footer={
          <>
            <Button
              variant="emerald"
              onClick={() => setCharacterToDelete(null)}
            >
              Ні, скасувати
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDeleteCharacter}
            >
              Видалити
            </Button>
          </>
        }
      >
        <div className="p-3 bg-[#7E0018]/10 border border-[#7E0018]/30 rounded-lg text-xs text-[#E5E7EB]">
          Разом із персонажем будуть видалені всі його пов'язані кампанії та збереження.
        </div>
      </Modal>
    </AppLayout>
  );
};

export default App;
