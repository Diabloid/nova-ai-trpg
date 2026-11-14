import React, { useState, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { HeaderStatusBar } from './components/character-drawer/HeaderStatusBar';
import { DrawerSheet } from './components/character-drawer/DrawerSheet';
import { ChatContainer } from './components/chat/ChatContainer';
import { ChatInput } from './components/input/ChatInput';
import { WizardScreen } from './components/wizard/WizardScreen';
import { EditHeroModal } from './components/modals/EditHeroModal';
import { NewCampaignModal } from './components/modals/NewCampaignModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { useGameStore } from './store/useGameStore';
import { useWizardStore } from './store/useWizardStore';
import type { CharacterSummary, CampaignSummary } from './types/api';

export const App: React.FC = () => {
  const {
    loadCharacters,
    deleteCampaign,
    deleteCharacter,
    setSystemAlert,
  } = useGameStore();
  const openWizard = useWizardStore((s) => s.openWizard);

  // Стан модальних вікон
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [isEditHeroModalOpen, setIsEditHeroModalOpen] = useState(false);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);

  const [campaignToDelete, setCampaignToDelete] = useState<CampaignSummary | null>(null);
  const [characterToDelete, setCharacterToDelete] = useState<CharacterSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Завантаження персонажів на старті
  useEffect(() => {
    loadCharacters().catch((err) => {
      console.warn('Не вдалося завантажити героїв під час старту:', err);
    });
  }, [loadCharacters]);

  // Редагування героя
  const handleEditCharacter = (char: CharacterSummary) => {
    setEditingCharId(char.char_id);
    setIsEditHeroModalOpen(true);
  };

  // Видалення кампанії
  const handleConfirmDeleteCampaign = async () => {
    if (!campaignToDelete || isDeleting) return;
    const campId = campaignToDelete.campaign_id;
    try {
      setIsDeleting(true);
      await deleteCampaign(campId);
      setCampaignToDelete(null);
      setSystemAlert('Кампанію успішно видалено', 'info');
    } catch (err: any) {
      setSystemAlert(`Помилка видалення кампанії: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Видалення персонажа
  const handleConfirmDeleteCharacter = async () => {
    if (!characterToDelete || isDeleting) return;
    const charId = characterToDelete.char_id;
    try {
      setIsDeleting(true);
      await deleteCharacter(charId);
      setCharacterToDelete(null);
      setSystemAlert('Персонажа успішно видалено', 'info');
    } catch (err: any) {
      setSystemAlert(`Помилка видалення героя: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout
      onOpenWizard={openWizard}
      onEditCharacter={handleEditCharacter}
      onRequestDeleteCharacter={(char) => setCharacterToDelete(char)}
      onNewCampaign={() => setIsNewCampaignModalOpen(true)}
      onRequestDeleteCampaign={(camp) => setCampaignToDelete(camp)}
      onOpenSettings={() => {
        setSystemAlert('⚙️ Меню налаштувань у розробці.', 'info');
      }}
      onLogout={() => {
        setSystemAlert('🚪 Вихід з акаунту здійснено. Дані сесії скинуто.', 'info');
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

      {/* 2. ПОВНОЕКРАННИЙ ВІЗАРД ТВОРЦЯ ДОЛІ */}
      <WizardScreen />

      {/* 3. МОДАЛЬНЕ ВІКНО: ШВИДКЕ РЕДАГУВАННЯ ГЕРОЯ */}
      <EditHeroModal
        isOpen={isEditHeroModalOpen}
        onClose={() => {
          setIsEditHeroModalOpen(false);
          setEditingCharId(null);
        }}
        charId={editingCharId}
      />

      {/* 4. МОДАЛЬНЕ ВІКНО: СТВОРЕННЯ НОВОЇ КАМПАНІЇ */}
      <NewCampaignModal
        isOpen={isNewCampaignModalOpen}
        onClose={() => setIsNewCampaignModalOpen(false)}
      />

      {/* 5. УНІВЕРСАЛЬНЕ МОДАЛЬНЕ ВІКНО: ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ КАМПАНІЇ */}
      <ConfirmModal
        isOpen={!!campaignToDelete}
        onClose={() => setCampaignToDelete(null)}
        onConfirm={handleConfirmDeleteCampaign}
        title="Видалити кампанію?"
        message={`Ви впевнені, що бажаєте безповоротно видалити кампанію «${campaignToDelete?.title}»? Увесь збережений прогрес та історія чату цієї кампанії будуть втрачені.`}
        confirmText="Так, видалити"
        cancelText="Ні, залишити"
        isLoading={isDeleting}
      />

      {/* 6. УНІВЕРСАЛЬНЕ МОДАЛЬНЕ ВІКНО: ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ ПЕРСОНАЖА */}
      <ConfirmModal
        isOpen={!!characterToDelete}
        onClose={() => setCharacterToDelete(null)}
        onConfirm={handleConfirmDeleteCharacter}
        title="Видалити персонажа?"
        message={`Ви впевнені, що бажаєте видалити героя «${characterToDelete?.name}» та всі пов'язані з ним кампанії?`}
        confirmText="Так, видалити"
        cancelText="Ні, залишити"
        isLoading={isDeleting}
      />
    </AppLayout>
  );
};

export default App;